package application

import (
	"time"

	"github.com/google/uuid"

	"clean-ddd/architecture/domain"
)

// Status is where an operation stands: pending, then the outcome its handler marked.
type Status string

const (
	StatusPending Status = "PENDING"
	StatusSuccess Status = "SUCCESS"
	StatusSent    Status = "SENT"
	StatusError   Status = "ERROR"
)

// Operation is what a published event becomes: a handle on its processing, with an id a client
// can poll, the event, the caller's context, and the outcome once a handler has marked it. The
// bus builds one in Publish and hands it to Dispatch, so the id exists before the handling
// starts and a transport can answer 202 { operationId } at once (ADR 14).
type Operation struct {
	ID         string
	Status     Status
	Event      domain.Event
	Context    *ExecutionContext
	CreatedAt  time.Time
	FinishedAt *time.Time
	// Result is what the handler returned on success; Error the refusal otherwise.
	Result any
	Error  *domain.Exception
}

func NewOperation(event domain.Event, context *ExecutionContext) *Operation {
	return NewOperationWithID(uuid.NewString(), event, context)
}

// NewOperationWithID is the operation of a message whose id exists before the bus sees it: an
// outbox entry relayed after the commit (ADR 24), recognised by its id wherever it is delivered.
func NewOperationWithID(id string, event domain.Event, context *ExecutionContext) *Operation {
	return &Operation{ID: id, Status: StatusPending, Event: event, Context: context, CreatedAt: time.Now().UTC()}
}

// Failed marks a command refused or a reaction that failed: the error is the operation's outcome.
func (o *Operation) Failed(err *domain.Exception) *Operation {
	now := time.Now().UTC()
	o.Status, o.Error, o.FinishedAt = StatusError, err, &now
	return o
}

// Succeeded marks a command that ran: its answer is the operation's result.
func (o *Operation) Succeeded(value any) *Operation {
	now := time.Now().UTC()
	o.Status, o.Result, o.FinishedAt = StatusSuccess, value, &now
	return o
}

// Sent marks a reaction that ran: an event handler answers nothing.
func (o *Operation) Sent() *Operation {
	o.Status = StatusSent
	return o
}
