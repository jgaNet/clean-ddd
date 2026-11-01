package application

import (
	"sync"
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
	// delivery is the bus's word on when every subscriber has finished with the message; nil
	// when the bus cannot tell.
	delivery *Delivery
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

// Dispatching is what a bus calls before it starts the operation's dispatch in the background:
// the delivery it answers settles once every subscriber the message reached has finished with
// it, when the bus calls Done after the dispatch. The outbox's relay acknowledges an entry on
// it, never sooner (ADR 24).
func (o *Operation) Dispatching() *Delivery {
	o.delivery = &Delivery{}
	return o.delivery
}

// Delivery is the operation's delivery, or nil when the bus that carries it cannot tell when
// its subscribers are done: the relay then acknowledges the entry at once.
func (o *Operation) Delivery() *Delivery {
	if o == nil {
		return nil
	}
	return o.delivery
}

// Delivery settles once every subscriber a message reached has finished with it, and says
// whether each one handled it (or had handled it before). A subscriber's inbox notes the one
// that failed (Missed); the bus settles it once the dispatch is done (Done); the relay asks to
// be told (OnDone). Every method is safe on a nil Delivery, which never settles anything.
type Delivery struct {
	mu      sync.Mutex
	done    bool
	missed  bool
	waiting []func(everyOne bool)
}

// Missed notes that a subscriber the message reached did not handle it: its reaction failed.
func (d *Delivery) Missed() {
	if d == nil {
		return
	}
	d.mu.Lock()
	defer d.mu.Unlock()
	d.missed = true
}

// Done settles the delivery: every subscriber has finished. What waits on it is told, in the calling goroutine.
func (d *Delivery) Done() {
	if d == nil {
		return
	}
	d.mu.Lock()
	if d.done {
		d.mu.Unlock()
		return
	}
	d.done = true
	waiting, everyOne := d.waiting, !d.missed
	d.waiting = nil
	d.mu.Unlock()
	for _, fn := range waiting {
		fn(everyOne)
	}
}

// OnDone tells fn whether every subscriber handled the message, once they have all finished:
// at once if they already have, from the bus's dispatch otherwise.
func (d *Delivery) OnDone(fn func(everyOne bool)) {
	if d == nil {
		return
	}
	d.mu.Lock()
	if !d.done {
		d.waiting = append(d.waiting, fn)
		d.mu.Unlock()
		return
	}
	everyOne := !d.missed
	d.mu.Unlock()
	fn(everyOne)
}
