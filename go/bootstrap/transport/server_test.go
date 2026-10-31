package transport_test

import (
	"slices"
	"sync"
	"testing"

	"clean-ddd/architecture/application"
	"clean-ddd/architecture/domain"
	"clean-ddd/architecture/infrastructure"
	"clean-ddd/bootstrap/transport"
)

// The relay at start delivers what a previous run made durable and did not publish (ADR 24). It
// runs in a context the transport builds as it builds a request's, with a unit of work of its
// own: a reaction it delivers runs in a transaction, and what the reaction tells is made durable
// and relayed under the outbox entry's id, which the bus recognises if the fact comes again.

type noteArchivedEvent struct {
	domain.DomainEvent
	NoteID string
}

type archivingToldIntegrationEvent struct {
	domain.IntegrationEvent
	NoteID string
}

// tellTheArchiving is a reaction that tells other contexts, as a domain event handler does (ADR 30).
type tellTheArchiving struct{}

func (tellTheArchiving) Execute(event noteArchivedEvent, ctx *application.ExecutionContext) error {
	application.PublishIntegrationEvent(archivingToldIntegrationEvent{NoteID: event.NoteID}, ctx)
	return nil
}

// relayingBus is the in-memory bus, noting the id of every message an outbox relay hands it:
// PublishWithID is how a relay publishes, under the id the outbox gave the entry.
type relayingBus struct {
	*infrastructure.InMemoryEventBus
	mu      sync.Mutex
	relayed []string
}

func (b *relayingBus) PublishWithID(event domain.Event, ctx *application.ExecutionContext, id string) *application.Operation {
	b.mu.Lock()
	b.relayed = append(b.relayed, id)
	b.mu.Unlock()
	return b.InMemoryEventBus.PublishWithID(event, ctx, id)
}

// told is a subscriber of the integration event, noting the id of each message it is handed.
type told struct {
	mu  sync.Mutex
	ids []string
}

func (t *told) Handle(operation *application.Operation) {
	t.mu.Lock()
	t.ids = append(t.ids, operation.ID)
	t.mu.Unlock()
	operation.Sent()
}

func TestTheRelayAtStartDeliversInAContextWithAUnitOfWork(t *testing.T) {
	bus := &relayingBus{InMemoryEventBus: infrastructure.NewInMemoryEventBus()}
	server := transport.New(bus, transport.Options{})
	reaction := application.Reaction[noteArchivedEvent](tellTheArchiving{})
	bus.Subscribe(reaction.Channel, reaction.Handlers[0])
	listener := &told{}
	bus.Subscribe(domain.NameOfType[archivingToldIntegrationEvent](), listener)

	// What a run that died after its commit left pending.
	infrastructure.SharedOutbox.Append([]domain.Event{noteArchivedEvent{NoteID: "n-1"}})
	application.RelayOutbox(infrastructure.SharedOutbox, bus, server.ExecutionContext("startup", transport.Anonymous))
	bus.Settle()

	if len(listener.ids) != 1 {
		t.Fatalf("the integration event was delivered %d times, want once", len(listener.ids))
	}
	if !slices.Contains(bus.relayed, listener.ids[0]) {
		t.Errorf("the integration event went out under %q, an id no outbox handed out: it was published straight to the bus", listener.ids[0])
	}
	if pending := infrastructure.SharedOutbox.Pending(); len(pending) != 0 {
		t.Errorf("%d outbox entries stay pending, want none", len(pending))
	}
}
