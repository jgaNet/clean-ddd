package note

import (
	"fmt"
	"slices"

	"clean-ddd/architecture/domain"
)

// Note is the aggregate root of the Notes context. Every method enforces the business rules
// before changing state:
//
//   - a note always has a valid title (the Title value object)
//   - only the owner can edit, archive, restore or share a note
//   - an archived note is read-only until it is restored: it can be neither edited nor shared
//     (ensureActive); archiving, restoring and reading it are not gated by that rule
//   - a note cannot be shared twice with the same account, nor with its owner
//
// The only ways in are Create and FromSnapshot; the state stays in unexported fields.
type Note struct {
	domain.AggregateRoot
	ownerID    domain.ID
	title      Title
	content    string
	status     Status
	sharedWith []string // raw ids, in the order they were added
}

// Create writes a brand new note. This is the only way to bring a Note into existence. The
// aggregate picks its own identity, so no persistence round-trip is needed first.
func Create(props NewNote) (*Note, error) {
	title, err := NewTitle(props.Title)
	if err != nil {
		return nil, err
	}
	id := domain.GenerateID()
	note := &Note{
		AggregateRoot: domain.NewAggregateRoot(id, 0),
		ownerID:       domain.NewID(props.OwnerID),
		title:         title,
		content:       props.Content,
		status:        StatusActive,
		sharedWith:    []string{},
	}
	note.Record(NoteCreatedEvent{NoteID: id.Value(), OwnerID: props.OwnerID, Title: title.Value()})
	return note, nil
}

// FromSnapshot rebuilds a Note from what was persisted. No event is recorded: nothing new
// happened. Persisted data has already been validated, so an invalid snapshot is a programming
// error and panics instead of returning an error (ADR 4). Trade-off to keep in mind: this
// re-runs today's Title rules on yesterday's data. If a rule gets stricter (say the maximum
// length shrinks), migrate existing notes before shipping it, or older notes will refuse to load.
func FromSnapshot(snapshot Snapshot) *Note {
	title, err := NewTitle(snapshot.Title)
	if err != nil {
		panic(fmt.Sprintf("corrupted note %s: %s", snapshot.ID, err.Error()))
	}
	if _, known := ParseStatus(string(snapshot.Status)); !known {
		panic(fmt.Sprintf("corrupted note %s: unknown status %q", snapshot.ID, snapshot.Status))
	}
	return &Note{
		AggregateRoot: domain.NewAggregateRoot(domain.NewID(snapshot.ID), snapshot.Version),
		ownerID:       domain.NewID(snapshot.OwnerID),
		title:         title,
		content:       snapshot.Content,
		status:        snapshot.Status,
		sharedWith:    append([]string{}, snapshot.SharedWith...),
	}
}

func (n *Note) Edit(editorID domain.ID, title, content string) error {
	if err := n.ensureOwner(editorID); err != nil {
		return err
	}
	if err := n.ensureActive(); err != nil {
		return err
	}
	newTitle, err := NewTitle(title)
	if err != nil {
		return err
	}
	n.title, n.content = newTitle, content
	n.Record(NoteEditedEvent{NoteID: n.ID().Value(), Title: newTitle.Value()})
	return nil
}

func (n *Note) Archive(actorID domain.ID) error {
	if err := n.ensureOwner(actorID); err != nil {
		return err
	}
	if n.status == StatusArchived {
		return NoteAlreadyArchived(n.ID().Value())
	}
	n.status = StatusArchived
	n.Record(NoteArchivedEvent{NoteID: n.ID().Value()})
	return nil
}

func (n *Note) Restore(actorID domain.ID) error {
	if err := n.ensureOwner(actorID); err != nil {
		return err
	}
	if n.status != StatusArchived {
		return NoteNotArchived(n.ID().Value())
	}
	n.status = StatusActive
	n.Record(NoteRestoredEvent{NoteID: n.ID().Value()})
	return nil
}

func (n *Note) ShareWith(actorID, recipientID domain.ID) error {
	if err := n.ensureOwner(actorID); err != nil {
		return err
	}
	if err := n.ensureActive(); err != nil {
		return err
	}
	if recipientID == n.ownerID {
		return CannotShareWithSelf(n.ID().Value())
	}
	if slices.Contains(n.sharedWith, recipientID.Value()) {
		return NoteAlreadyShared(n.ID().Value(), recipientID.Value())
	}
	n.sharedWith = append(n.sharedWith, recipientID.Value())
	n.Record(NoteSharedEvent{NoteID: n.ID().Value(), Title: n.title.Value(), OwnerID: n.ownerID.Value(), RecipientID: recipientID.Value()})
	return nil
}

func (n *Note) IsVisibleTo(accountID domain.ID) bool {
	return n.ownerID == accountID || slices.Contains(n.sharedWith, accountID.Value())
}

// ToSnapshot is the plain data to persist. FromSnapshot(n.ToSnapshot()) gives back an equal note.
func (n *Note) ToSnapshot() Snapshot {
	return Snapshot{
		ID:         n.ID().Value(),
		OwnerID:    n.ownerID.Value(),
		Title:      n.title.Value(),
		Content:    n.content,
		Status:     n.status,
		SharedWith: append([]string{}, n.sharedWith...),
		Version:    n.Version(),
	}
}

func (n *Note) ensureOwner(actorID domain.ID) error {
	if n.ownerID != actorID {
		return NotNoteOwner(n.ID().Value(), actorID.Value())
	}
	return nil
}

func (n *Note) ensureActive() error {
	if n.status == StatusArchived {
		return NoteArchived(n.ID().Value())
	}
	return nil
}

func (n *Note) OwnerID() domain.ID   { return n.ownerID }
func (n *Note) Title() string        { return n.title.Value() }
func (n *Note) Content() string      { return n.content }
func (n *Note) Status() Status       { return n.status }
func (n *Note) SharedWith() []string { return slices.Clone(n.sharedWith) }
