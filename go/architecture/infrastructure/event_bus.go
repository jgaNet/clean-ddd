package infrastructure

import (
	"sync"

	"clean-ddd/architecture/application"
	"clean-ddd/architecture/domain"
)

// InMemoryEventBus is a process-local bus: a map of handlers by event name. Publish builds the
// operation and starts its dispatch in a goroutine, answering with the operation at once, so a
// route can answer 202 { operationId } before the handling is done (ADR 14); the handler fills
// the operation's status and result in, and the Tracker context records those by decorating
// this bus. Settle waits for every dispatch still running: a test calls it to see what the
// handlers did, the bootstrap calls it before stopping.
//
// Delivery is idempotent per subscriber (ADR 24): a message relayed from the outbox carries its
// entry's id, and a subscriber that already handled that id — and did not fail — is not handed
// it again. The inbox is the bus's, not each handler's, so a reaction stays a plain Execute; a
// reaction that failed is handed the message again, which is what at-least-once is for. The
// operation's Delivery settles once its dispatch is done, and says whether every subscriber
// handled it: the outbox's relay acknowledges an entry on it, and on nothing sooner.
type InMemoryEventBus struct {
	mu       sync.RWMutex
	handlers map[string][]application.Subscriber
	pending  sync.WaitGroup
}

func NewInMemoryEventBus() *InMemoryEventBus {
	return &InMemoryEventBus{handlers: map[string][]application.Subscriber{}}
}

// Connect has nothing to connect to: the handlers are in this process.
func (b *InMemoryEventBus) Connect() error { return nil }

func (b *InMemoryEventBus) Publish(event domain.Event, context *application.ExecutionContext) *application.Operation {
	return b.start(application.NewOperation(event, context))
}

func (b *InMemoryEventBus) PublishWithID(event domain.Event, context *application.ExecutionContext, messageID string) *application.Operation {
	return b.start(application.NewOperationWithID(messageID, event, context))
}

func (b *InMemoryEventBus) start(operation *application.Operation) *application.Operation {
	delivery := operation.Dispatching()
	b.pending.Add(1)
	go func() {
		defer b.pending.Done()
		b.Dispatch(operation)
		delivery.Done()
	}()
	return operation
}

// Dispatch runs every handler of the channel, in order, in the calling goroutine. The channel
// is the event's name: what arrives on it is that event, which the map cannot know.
func (b *InMemoryEventBus) Dispatch(operation *application.Operation) {
	b.mu.RLock()
	handlers := append([]application.Subscriber(nil), b.handlers[domain.NameOf(operation.Event)]...)
	b.mu.RUnlock()
	for _, handler := range handlers {
		handler.Handle(operation)
	}
}

// Subscribe routes the channel to the handler, behind its own inbox.
func (b *InMemoryEventBus) Subscribe(channel string, handler application.Subscriber) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.handlers[channel] = append(b.handlers[channel], &inbox{handler: handler, handled: map[string]bool{}})
}

// Settle waits for every dispatch in flight, including the ones those dispatches publish.
func (b *InMemoryEventBus) Settle() { b.pending.Wait() }

// inbox is one subscription's memory of the messages it handled: a message whose id it already
// handled, or is handling now, is marked sent and not handed to the handler again; one whose
// reaction failed is forgotten, so the next relay hands it again.
type inbox struct {
	handler application.Subscriber
	mu      sync.Mutex
	// handled is the id of every message handled, true, or being handled now, false.
	handled map[string]bool
}

func (i *inbox) Handle(operation *application.Operation) {
	if !i.claim(operation.ID) {
		operation.Sent()
		return
	}
	i.handler.Handle(operation)
	// The handlers run one after the other in the dispatch's goroutine, and each one marks the
	// operation: the status read here, before the next one runs, is this subscriber's own outcome.
	handled := operation.Status != application.StatusError
	if !handled {
		operation.Delivery().Missed()
	}
	i.settle(operation.ID, handled)
}

func (i *inbox) claim(id string) bool {
	i.mu.Lock()
	defer i.mu.Unlock()
	if _, seen := i.handled[id]; seen {
		return false
	}
	i.handled[id] = false
	return true
}

func (i *inbox) settle(id string, handled bool) {
	i.mu.Lock()
	defer i.mu.Unlock()
	if handled {
		i.handled[id] = true
		return
	}
	delete(i.handled, id)
}
