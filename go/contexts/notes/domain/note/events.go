package note

import "clean-ddd/architecture/domain"

// Domain events are facts, named in the past tense, recorded by the Note aggregate when
// something meaningful happened. They carry just enough data for a listener to react. They
// stay inside the Notes context: when another context must know, an application handler
// translates them into an integration event (see application/events).

type NoteCreatedEvent struct {
	domain.DomainEvent
	NoteID  string
	OwnerID string
	Title   string
}

type NoteEditedEvent struct {
	domain.DomainEvent
	NoteID string
	Title  string
}

type NoteArchivedEvent struct {
	domain.DomainEvent
	NoteID string
}

type NoteRestoredEvent struct {
	domain.DomainEvent
	NoteID string
}

type NoteSharedEvent struct {
	domain.DomainEvent
	NoteID      string
	Title       string
	OwnerID     string
	RecipientID string
}
