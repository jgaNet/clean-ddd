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
// Transaction and AfterCommit are what make "publish after commit" possible (ADR 3).
type ExecutionContext struct {
	traceID    string
	auth       Auth
	eventBus   EventBus
	unitOfWork UnitOfWork
	logger     Logger

	mu            sync.Mutex
	inTransaction bool
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

// AfterCommit defers callback until the current transaction is committed, so that its side
// effects (typically publishing domain events) never leak facts that end up rolled back.
// Outside of any transaction the callback runs immediately.
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

// Transaction runs fn inside the context's unit of work when there is one, then runs the
// AfterCommit callbacks registered during fn once the transaction is committed. A refusal or a
// panic rolls back and drops those callbacks. Nested calls join the outer transaction. A
// package function because a method cannot be generic.
func Transaction[T any](c *ExecutionContext, fn func() (T, error)) (T, error) {
	c.mu.Lock()
	outermost := !c.inTransaction
	c.inTransaction = true
	c.mu.Unlock()

	value, err := runInUnitOfWork(c, fn)

	if outermost {
		c.mu.Lock()
		callbacks := c.afterCommit
		c.afterCommit, c.inTransaction = nil, false
		c.mu.Unlock()
		if err == nil {
			for _, callback := range callbacks {
				callback()
			}
		}
	}
	return value, err
}

func runInUnitOfWork[T any](c *ExecutionContext, fn func() (T, error)) (value T, err error) {
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
	if !joined {
		if err != nil {
			_ = unitOfWork.RollbackTransaction()
		} else if commitErr := unitOfWork.CommitTransaction(); commitErr != nil {
			return value, commitErr
		}
	}
	return value, err
}

type silent struct{}

func (silent) Info(string, Meta)         {}
func (silent) Warn(string, Meta)         {}
func (silent) Error(string, error, Meta) {}
func (silent) Debug(string, Meta)        {}
