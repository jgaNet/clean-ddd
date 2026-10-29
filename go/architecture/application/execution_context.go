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
	HasActiveTransaction() bool
	// Outbox is the transactional outbox: what this transaction makes durable to be published after it commits (ADR 24).
	Outbox() Outbox
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
// rollback. Outside of any transaction (a reaction, after the command that set it off
// committed) the step runs immediately and the outbox is relayed at once: there is no commit
// ahead to relay after.
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
// callback. Nested calls join the outer transaction: everything happens at the outermost one.
// A package function because a method cannot be generic.
func Transaction[T any](c *ExecutionContext, fn func() (T, error)) (T, error) {
	c.mu.Lock()
	outermost := !c.inTransaction
	c.inTransaction = true
	c.mu.Unlock()

	value, err := runInUnitOfWork(c, fn, outermost)

	if outermost {
		c.mu.Lock()
		callbacks := c.afterCommit
		c.afterCommit, c.beforeCommit, c.inTransaction = nil, nil, false
		c.mu.Unlock()
		if err == nil {
			c.relay()
			for _, callback := range callbacks {
				callback()
			}
		}
	}
	return value, err
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

func runInUnitOfWork[T any](c *ExecutionContext, fn func() (T, error), outermost bool) (value T, err error) {
	unitOfWork := c.unitOfWork
	joined := unitOfWork == nil || unitOfWork.HasActiveTransaction()
	if !joined {
		if err = unitOfWork.BeginTransaction(); err != nil {
			return value, err
		}
	}
	defer func() {
		if recovered := recover(); recovered != nil {
			err = domain.Recovered(recovered)
			if !joined {
				_ = unitOfWork.RollbackTransaction()
			}
			c.Log().Error("Transaction failed", err, Meta{"traceId": c.traceID, "userId": c.auth.SubjectID})
			err = domain.Unknown(err.Error(), nil)
		}
	}()
	value, err = fn()
	if unitOfWork == nil {
		if outermost && err == nil {
			c.runBeforeCommit()
		}
		return value, err
	}
	if !joined {
		if err != nil {
			_ = unitOfWork.RollbackTransaction()
		} else {
			if outermost {
				c.runBeforeCommit()
			}
			if commitErr := unitOfWork.CommitTransaction(); commitErr != nil {
				return value, commitErr
			}
		}
	}
	return value, err
}

type silent struct{}

func (silent) Info(string, Meta)         {}
func (silent) Warn(string, Meta)         {}
func (silent) Error(string, error, Meta) {}
func (silent) Debug(string, Meta)        {}
