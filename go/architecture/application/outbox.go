package application

import (
	"fmt"

	"clean-ddd/architecture/domain"
)

// The transactional outbox (ADR 24): the facts a transaction makes durable with the state they
// describe, published after the commit by a relay. A domain event is never published from
// memory alone: PublishDomainEvents appends it here at commit, inside the transaction, so a
// rollback drops it with the writes it described, and Transaction relays what is pending once
// the commit is through. A process that dies between the commit and the relay delays the fact
// until the next relay — the next commit, or the application's start — instead of losing it.
//
// The outbox is the unit of work's (UnitOfWork.Outbox), since it lives and dies with the
// transaction, and one per process, since a relay publishes whatever is pending, whoever
// stored it. Delivery is therefore at least once; the bus delivers a message it already
// delivered to a subscriber once only, by the entry's id, which travels as the message's id.
//
// Implementations: the in-memory outbox of the building blocks' Infrastructure, a store the
// in-memory unit of work snapshots and restores with the others.

// OutboxEntry is a fact made durable and not yet published: the id the message will carry, and the event.
type OutboxEntry struct {
	ID    string
	Event domain.Event
}

// Outbox is the port.
type Outbox interface {
	// Append stores the events with the transaction's writes, to be rolled back with them. The entries, in order.
	Append(events []domain.Event) []OutboxEntry
	// Pending is what is durable and not yet published, oldest first.
	Pending() []OutboxEntry
	// MarkPublished acknowledges a delivery: the entry will not be published again.
	MarkPublished(id string)
}

// RelayOutbox publishes every pending entry through the bus, with the entry's id as the
// message's id, and marks it published once the bus has it. A publication that panics leaves
// the entry pending, for the next relay, and the relay goes on with the next entry: one fact
// that cannot go out does not hold the others. The context's relay after each commit and the
// bootstrap's at start are the two callers. The entries published, in order.
func RelayOutbox(outbox Outbox, bus EventBus, context *ExecutionContext) []OutboxEntry {
	var published []OutboxEntry
	for _, entry := range outbox.Pending() {
		if relayEntry(outbox, bus, context, entry) {
			published = append(published, entry)
		}
	}
	return published
}

func relayEntry(outbox Outbox, bus EventBus, context *ExecutionContext, entry OutboxEntry) (published bool) {
	defer func() {
		if recovered := recover(); recovered != nil {
			context.Log().Error(fmt.Sprintf("Outbox entry %s (%s) stays pending", entry.ID, domain.NameOf(entry.Event)),
				domain.Recovered(recovered), Meta{"traceId": context.TraceID()})
			published = false
		}
	}()
	bus.PublishWithID(entry.Event, context, entry.ID)
	outbox.MarkPublished(entry.ID)
	return true
}
