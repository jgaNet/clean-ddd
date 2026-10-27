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
	operation := application.NewOperation(event, context)
	b.pending.Add(1)
	go func() {
		defer b.pending.Done()
		b.Dispatch(operation)
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

func (b *InMemoryEventBus) Subscribe(channel string, handler application.Subscriber) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.handlers[channel] = append(b.handlers[channel], handler)
}

// Settle waits for every dispatch in flight, including the ones those dispatches publish.
func (b *InMemoryEventBus) Settle() { b.pending.Wait() }
