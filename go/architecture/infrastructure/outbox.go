package infrastructure

import (
	"clean-ddd/architecture/application"
	"clean-ddd/architecture/domain"
)

// InMemoryOutbox is the outbox over an in-memory store (ADR 24). It is an InMemoryDataSource
// like any other, so the in-memory unit of work snapshots it when a transaction begins and
// puts it back on a rollback: an entry appended by a transaction that fails is gone with the
// transaction's other writes, which is the whole point of writing the facts where the state
// is. Insertion order is publication order; a published entry is dropped rather than flagged,
// since nothing here reads history. One per process, shared by every request's unit of work
// (see the bootstrap).
type InMemoryOutbox struct {
	store *InMemoryDataSource[application.OutboxEntry]
}

// SharedOutbox is the process's outbox, for a unit of work built without one: tests, and the bootstrap's default.
var SharedOutbox = NewInMemoryOutbox()

func NewInMemoryOutbox() *InMemoryOutbox {
	return &InMemoryOutbox{store: NewInMemoryDataSource[application.OutboxEntry]()}
}

// Store is the outbox as a store, for a unit of work to snapshot with the others.
func (o *InMemoryOutbox) Store() Snapshotter { return o.store }

func (o *InMemoryOutbox) Append(events []domain.Event) []application.OutboxEntry {
	entries := make([]application.OutboxEntry, 0, len(events))
	for _, event := range events {
		entry := application.OutboxEntry{ID: domain.GenerateID().Value(), Event: event}
		o.store.Set(entry.ID, entry)
		entries = append(entries, entry)
	}
	return entries
}

func (o *InMemoryOutbox) Pending() []application.OutboxEntry { return o.store.All() }

func (o *InMemoryOutbox) MarkPublished(id string) { o.store.Delete(id) }
