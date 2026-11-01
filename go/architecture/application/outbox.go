package application

import (
	"fmt"
	"sync"

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

// onTheirWay is the id of every entry handed to the bus whose subscribers have not all finished
// with it yet: a relay that runs meanwhile does not hand it out a second time.
var onTheirWay sync.Map

// RelayOutbox publishes every pending entry through the bus, with the entry's id as the
// message's id, and marks it published once every subscriber it reached has handled it (the
// operation's Delivery), never sooner: a process that dies while a reaction runs leaves the
// entry pending, and the next relay hands it out again, to the subscribers that had not handled
// it yet. An entry whose reaction failed stays pending too, for the next relay; one still on its
// way is not handed out a second time meanwhile. A bus that cannot tell when its subscribers are
// done has the entry marked published at once. A publication that panics leaves the entry
// pending, for the next relay, and the relay goes on with the next entry: one fact that cannot
// go out does not hold the others. The context's relay after each commit and the bootstrap's at
// start are the two callers. The entries handed to the bus, in order.
func RelayOutbox(outbox Outbox, bus EventBus, context *ExecutionContext) []OutboxEntry {
	var handed []OutboxEntry
	for _, entry := range outbox.Pending() {
		if _, already := onTheirWay.LoadOrStore(entry.ID, struct{}{}); already {
			continue
		}
		if relayEntry(outbox, bus, context, entry) {
			handed = append(handed, entry)
		}
	}
	return handed
}

func relayEntry(outbox Outbox, bus EventBus, context *ExecutionContext, entry OutboxEntry) (handed bool) {
	defer func() {
		if recovered := recover(); recovered != nil {
			context.Log().Error(fmt.Sprintf("Outbox entry %s (%s) stays pending", entry.ID, domain.NameOf(entry.Event)),
				domain.Recovered(recovered), Meta{"traceId": context.TraceID()})
			onTheirWay.Delete(entry.ID)
			handed = false
		}
	}()
	delivery := bus.PublishWithID(entry.Event, context, entry.ID).Delivery()
	if delivery == nil {
		outbox.MarkPublished(entry.ID)
		onTheirWay.Delete(entry.ID)
		return true
	}
	delivery.OnDone(func(everyOne bool) {
		if everyOne {
			outbox.MarkPublished(entry.ID)
		}
		onTheirWay.Delete(entry.ID)
	})
	return true
}
