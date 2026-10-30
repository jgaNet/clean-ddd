package application

import (
	"sync"

	"clean-ddd/architecture/domain"
)

// Auth is who is calling: the subject's id and role, both empty for an anonymous request. Which
// roles exist is the shared kernel's business, not the mechanics'.
type Auth struct {
	SubjectID string
	Role      string
}

// UnitOfWork is the transaction boundary: a database's four verbs, or the in-memory stores' snapshot.
type UnitOfWork interface {
	BeginTransaction() error
	CommitTransaction() error
	RollbackTransaction() error
	// HasActiveTransaction is whether a transaction is open. The context owns its transaction: it
	// asks this before opening one, and a transaction already open there is a programming error,
	// not one to join.
	HasActiveTransaction() bool
	// Outbox is the transactional outbox: what this transaction makes durable to be published after it commits (ADR 24).
	Outbox() Outbox
	// Another is a unit of work over the same stores and the same outbox, for a transaction of its
	// own: the one a reaction runs in (ADR 30). With a database, another transaction from the same pool.
	Another() UnitOfWork
}

// ExecutionContext travels with one request through every handler it reaches: who is calling
// (Auth), how to correlate the logs (TraceID), and the services a use case may need without
// owning them (Logger, EventBus, UnitOfWork). That is the whole list, on purpose: each member
// exists per request. Anything a handler needs that does not (a mailer, a clock, a model
// client) is a constructor dependency, so that the handler's needs stay in its signature and
// the context does not become a service locator (ARCH-EXECUTION-CONTEXT).
//
// The bootstrap builds one per HTTP request; tests build one by hand with NewExecutionContext.
// A handler reads ctx.Auth() to know the caller and passes ctx on when it publishes.
// Transaction, BeforeCommit and AfterCommit are what make "durable, then published" possible:
// the events are appended to the unit of work's outbox at commit and relayed after it (ADR 3,
// ADR 24).
type ExecutionContext struct {
	traceID    string
	auth       Auth
	eventBus   EventBus
	unitOfWork UnitOfWork
	logger     Logger

	mu            sync.Mutex
	inTransaction bool
	beforeCommit  []func()
	afterCommit   []func()
}

// Options is what a context is built from; EventBus and TraceID are the two a test always gives.
type Options struct {
	TraceID    string
	Auth       Auth
	EventBus   EventBus
	UnitOfWork UnitOfWork
	Logger     Logger
}

func NewExecutionContext(options Options) *ExecutionContext {
	return &ExecutionContext{
		traceID:    options.TraceID,
		auth:       options.Auth,
		eventBus:   options.EventBus,
		unitOfWork: options.UnitOfWork,
		logger:     options.Logger,
	}
}

// ForReaction is the context a reaction to this request's facts runs in (ADR 30): the same
// caller, trace, bus and logger, and a unit of work of its own. A reaction's transaction is its
// own — not the one that published the fact, which may still be open in this context while it
// relays, nor the one of another reaction to the same fact, running beside it.
func (c *ExecutionContext) ForReaction() *ExecutionContext {
	var unitOfWork UnitOfWork
	if c.unitOfWork != nil {
		unitOfWork = c.unitOfWork.Another()
	}
	return NewExecutionContext(Options{
		TraceID:    c.traceID,
		Auth:       c.auth,
		EventBus:   c.eventBus,
		UnitOfWork: unitOfWork,
		Logger:     c.logger,
	})
}

func (c *ExecutionContext) TraceID() string        { return c.traceID }
func (c *ExecutionContext) Auth() Auth             { return c.auth }
func (c *ExecutionContext) EventBus() EventBus     { return c.eventBus }
func (c *ExecutionContext) UnitOfWork() UnitOfWork { return c.unitOfWork }
func (c *ExecutionContext) Logger() Logger         { return c.logger }

// Publish puts an event on the bus with this context, the way a handler or a route does.
func (c *ExecutionContext) Publish(event domain.Event) *Operation {
	return c.eventBus.Publish(event, c)
}

// Log is the logger, or a silent one, so a handler never checks for nil.
func (c *ExecutionContext) Log() Logger {
	if c.logger == nil {
		return silent{}
	}
	return c.logger
}

// BeforeCommit runs step inside the current transaction, once the use case has succeeded and
// just before the commit: where PublishDomainEvents appends the aggregate's events to the
// outbox, so that they are durable with the state they describe and gone with it on a
// rollback. Outside of any transaction (a handler's unit test calling Execute directly) the
// step runs immediately and the outbox is relayed at once: there is no commit ahead to relay
// after. A reaction is inside one: the base handler opens it (ADR 30).
func (c *ExecutionContext) BeforeCommit(step func()) {
	c.mu.Lock()
	if !c.inTransaction {
		c.mu.Unlock()
		step()
		c.relay()
		return
	}
	c.beforeCommit = append(c.beforeCommit, step)
	c.mu.Unlock()
}

// AfterCommit defers callback until the current transaction is committed, so that its side
// effects never leak facts that end up rolled back. Outside of any transaction the callback
// runs immediately.
func (c *ExecutionContext) AfterCommit(callback func()) {
	c.mu.Lock()
	if !c.inTransaction {
		c.mu.Unlock()
		callback()
		return
	}
	c.afterCommit = append(c.afterCommit, callback)
	c.mu.Unlock()
}

// Transaction runs fn inside the context's unit of work when there is one: the BeforeCommit
// steps registered during fn run inside the transaction once fn has succeeded (the outbox is
// written there), then the transaction commits, then the outbox is relayed through the bus,
// then the AfterCommit callbacks run. A refusal or a panic rolls back and drops every step and
// callback — whatever the failure, so a context is clean for its next transaction even after a
// unit of work that could not begin or roll back. Nested calls join the outer transaction:
// everything happens at the outermost one. The context owns that transaction: it opens it and
// closes it, and a unit of work that already has one open at the outermost call is a
// programming error (the steps and callbacks would otherwise run against a commit this context
// never sees), reported as a failure before fn runs. A package function because a method
// cannot be generic.
func Transaction[T any](c *ExecutionContext, fn func() (T, error)) (T, error) {
	c.mu.Lock()
	outermost := !c.inTransaction
	c.inTransaction = true
	c.mu.Unlock()
	if !outermost {
		return runInUnitOfWork(c, fn, false)
	}

	// Whatever happened below, the outermost call leaves nothing behind: no step, no callback,
	// no open flag.
	defer c.leave()

	value, err := runInUnitOfWork(c, fn, true)
	if err != nil {
		return value, err
	}
	// The context leaves its transaction before relaying: the bus dispatches in its own goroutine
	// with this very context, which must be clean for its next transaction. A reaction never
	// joins it anyway: it runs in a context and a transaction of its own (ForReaction, ADR 30).
	callbacks := c.leave()
	c.relay()
	for _, callback := range callbacks {
		callback()
	}
	return value, nil
}

// leave closes the outermost transaction on the context: the flag goes down and both lists are
// dropped, whatever happened. The AfterCommit callbacks are handed back, for the caller to run
// after a commit and to drop after anything else.
func (c *ExecutionContext) leave() []func() {
	c.mu.Lock()
	defer c.mu.Unlock()
	callbacks := c.afterCommit
	c.afterCommit, c.beforeCommit, c.inTransaction = nil, nil, false
	return callbacks
}

// outbox is the unit of work's, or nil without a unit of work.
func (c *ExecutionContext) outbox() Outbox {
	if c.unitOfWork == nil {
		return nil
	}
	return c.unitOfWork.Outbox()
}

// relay publishes what the outbox holds: after the outermost commit, and at once outside any transaction.
func (c *ExecutionContext) relay() {
	if outbox := c.outbox(); outbox != nil {
		RelayOutbox(outbox, c.eventBus, c)
	}
}

// runBeforeCommit runs the BeforeCommit steps, inside the transaction, once the outermost use case has succeeded.
func (c *ExecutionContext) runBeforeCommit() {
	c.mu.Lock()
	steps := c.beforeCommit
	c.beforeCommit = nil
	c.mu.Unlock()
	for _, step := range steps {
		step()
	}
}

// runInUnitOfWork is the work inside its transaction. Without a unit of work there is no
// transaction: the work runs, and the steps run after it when it succeeded. With one, the
// outermost call owns the transaction — it refuses a unit of work that already has one open,
// begins, runs the work, then rolls back once on a failure, or runs the steps and commits, and
// rolls back if that could not go through — while a nested call only runs its work. A panic of
// the work is the failed result it should have returned (DOMAIN-RESULT).
func runInUnitOfWork[T any](c *ExecutionContext, fn func() (T, error), outermost bool) (value T, err error) {
	unitOfWork := c.unitOfWork
	if unitOfWork == nil {
		value, err = recovering(c, fn)
		if outermost && err == nil {
			c.runBeforeCommit()
		}
		return value, err
	}

	if outermost {
		if unitOfWork.HasActiveTransaction() {
			return value, domain.Unknown("The unit of work already has a transaction open: the context owns its transaction and opens it itself, nothing else may begin one", nil)
		}
		if err = unitOfWork.BeginTransaction(); err != nil {
			return value, err
		}
	}

	value, err = recovering(c, fn)
	if !outermost {
		return value, err
	}
	if err != nil {
		return value, rolledBack(unitOfWork, err)
	}
	if err = c.commit(unitOfWork); err != nil {
		return value, rolledBack(unitOfWork, err)
	}
	return value, nil
}

// recovering runs fn and turns a panic of it into the failed result it should have returned:
// logged as the transaction's failure, carried as an Unknown refusal (DOMAIN-RESULT).
func recovering[T any](c *ExecutionContext, fn func() (T, error)) (value T, err error) {
	defer func() {
		if recovered := recover(); recovered != nil {
			err = c.failed(domain.Recovered(recovered))
		}
	}()
	return fn()
}

// commit runs the BeforeCommit steps inside the transaction and commits it; a step that panics
// or a commit that is refused is the transaction's failure, for the caller to roll back.
func (c *ExecutionContext) commit(unitOfWork UnitOfWork) (err error) {
	defer func() {
		if recovered := recover(); recovered != nil {
			err = c.failed(domain.Recovered(recovered))
		}
	}()
	c.runBeforeCommit()
	if err := unitOfWork.CommitTransaction(); err != nil {
		return c.failed(err)
	}
	return nil
}

// failed logs a failure of the transaction's own mechanics and returns it as the refusal the
// operation records: an Unknown one, since nobody declared it.
func (c *ExecutionContext) failed(err error) error {
	c.Log().Error("Transaction failed", err, Meta{"traceId": c.traceID, "userId": c.auth.SubjectID})
	return domain.Unknown(err.Error(), nil)
}

// rolledBack undoes the transaction after a failure, once. A unit of work that cannot even roll
// back is the failure reported instead: the context can promise nothing about what it left behind.
func rolledBack(unitOfWork UnitOfWork, err error) error {
	if rollbackErr := unitOfWork.RollbackTransaction(); rollbackErr != nil {
		return rollbackErr
	}
	return err
}

type silent struct{}

func (silent) Info(string, Meta)         {}
func (silent) Warn(string, Meta)         {}
func (silent) Error(string, error, Meta) {}
func (silent) Debug(string, Meta)        {}
