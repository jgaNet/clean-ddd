package domain

// AggregateRoot is the entry point of an aggregate: a cluster of objects that must always be
// consistent together and that is loaded and saved as a whole.
//
// On top of the identity it embeds, an aggregate root records the domain events raised by its
// own behaviour. The domain decides *that* something happened; the application layer decides
// *when* to publish it (after the aggregate is saved).
//
// It also carries the version it was loaded with, so that a repository can refuse to save it
// over a newer one: two writers who read the same version cannot both win (ADR 8). A new
// aggregate is version 0; the repository stores version + 1 on every save. The aggregate never
// changes its own version: it is a fact about what was read, not about what happened.
//
// Usage:
//   - inside a behaviour: n.Record(NoteArchivedEvent{NoteID: ...})
//   - inside a command handler, once saved: application.PublishDomainEvents(note, ctx)
//
// Record is exported because an aggregate lives in its own package; only an aggregate's own
// behaviours call it (DOMAIN-RECORDS-EVENTS) — a handler that builds an event lies about what
// happened. See contexts/notes/domain/note/note.go for a complete example.
type AggregateRoot struct {
	Entity
	version int
	events  []Event
}

func NewAggregateRoot(id ID, version int) AggregateRoot {
	return AggregateRoot{Entity: NewEntity(id), version: version}
}

// Version is the one this aggregate was loaded with (0 when it was just created).
func (a *AggregateRoot) Version() int { return a.version }

// Record keeps a fact a behaviour produced, until the handler publishes it after the commit.
func (a *AggregateRoot) Record(event Event) { a.events = append(a.events, event) }

// PullDomainEvents hands over the facts recorded since the last pull, and forgets them.
func (a *AggregateRoot) PullDomainEvents() []Event {
	events := a.events
	a.events = nil
	return events
}
