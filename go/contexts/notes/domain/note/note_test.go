package note

import (
	"reflect"
	"strings"
	"testing"

	"clean-ddd/architecture/domain"
)

var (
	owner    = domain.NewID("alice")
	stranger = domain.NewID("bob")
)

func aNote(t *testing.T) *Note {
	t.Helper()
	n, err := Create(NewNote{OwnerID: owner.Value(), Title: "Groceries", Content: "Milk"})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	n.PullDomainEvents()
	return n
}

func anArchivedNote(t *testing.T) *Note {
	t.Helper()
	n := aNote(t)
	if err := n.Archive(owner); err != nil {
		t.Fatalf("Archive: %v", err)
	}
	n.PullDomainEvents()
	return n
}

func refusalType(t *testing.T, err error) string {
	t.Helper()
	refused, ok := domain.Refusal(err)
	if !ok {
		t.Fatalf("expected a refusal, got %v", err)
	}
	return refused.Type
}

func sameEvents(t *testing.T, got []domain.Event, want ...domain.Event) {
	t.Helper()
	if len(got) == 0 && len(want) == 0 {
		return
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("events: got %v, want %v", got, want)
	}
}

// Writing a note

func TestCreatePicksItsOwnIdentityStartsActiveUnsharedAndRecordsNoteCreated(t *testing.T) {
	n, err := Create(NewNote{OwnerID: "alice", Title: "  Groceries ", Content: "Milk"})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if n.ID().Value() == "" {
		t.Error("a new note picks its own identity")
	}
	if n.Status() != StatusActive {
		t.Errorf("status: got %s, want ACTIVE", n.Status())
	}
	if len(n.SharedWith()) != 0 {
		t.Errorf("shared with: got %v, want nobody", n.SharedWith())
	}
	if n.Title() != "Groceries" || n.Content() != "Milk" || n.OwnerID() != owner {
		t.Errorf("state: got %q %q %v", n.Title(), n.Content(), n.OwnerID())
	}
	if n.Version() != 0 {
		t.Errorf("version: got %d, want 0", n.Version())
	}
	sameEvents(t, n.PullDomainEvents(), NoteCreatedEvent{NoteID: n.ID().Value(), OwnerID: "alice", Title: "Groceries"})
	sameEvents(t, n.PullDomainEvents())
}

func TestCreateGivesEveryNoteADistinctIdentity(t *testing.T) {
	if aNote(t).Equals(aNote(t).Entity) {
		t.Error("two notes should never be the same thing")
	}
}

func TestCreateRefusesABlankTitle(t *testing.T) {
	_, err := Create(NewNote{OwnerID: "alice", Title: "   ", Content: ""})
	if refusalType(t, err) != "BlankNoteTitle" {
		t.Errorf("got %v", err)
	}
}

// Editing a note

func TestEditChangesTitleAndContentAndRecordsNoteEdited(t *testing.T) {
	n := aNote(t)

	if err := n.Edit(owner, "Shopping", "Bread"); err != nil {
		t.Fatalf("Edit: %v", err)
	}

	if n.Title() != "Shopping" || n.Content() != "Bread" {
		t.Errorf("got %q %q", n.Title(), n.Content())
	}
	sameEvents(t, n.PullDomainEvents(), NoteEditedEvent{NoteID: n.ID().Value(), Title: "Shopping"})
}

func TestEditIsReservedToTheOwner(t *testing.T) {
	n := aNote(t)
	if refusalType(t, n.Edit(stranger, "Hacked", "")) != "NotNoteOwner" {
		t.Error("a stranger cannot edit")
	}
	if n.Title() != "Groceries" {
		t.Errorf("the title should be untouched, got %q", n.Title())
	}
}

func TestEditIsRefusedOnAnArchivedNote(t *testing.T) {
	if refusalType(t, anArchivedNote(t).Edit(owner, "Shopping", "Bread")) != "NoteArchived" {
		t.Error("an archived note is read-only")
	}
}

func TestEditKeepsThePreviousTitleWhenTheNewOneIsInvalid(t *testing.T) {
	n := aNote(t)
	if refusalType(t, n.Edit(owner, "   ", "Bread")) != "BlankNoteTitle" {
		t.Error("a blank title is refused")
	}
	if n.Title() != "Groceries" || n.Content() != "Milk" {
		t.Errorf("nothing should have changed, got %q %q", n.Title(), n.Content())
	}
	sameEvents(t, n.PullDomainEvents())
}

// Archiving and restoring

func TestArchiveArchivesAnActiveNoteAndRecordsNoteArchived(t *testing.T) {
	n := aNote(t)
	if err := n.Archive(owner); err != nil {
		t.Fatalf("Archive: %v", err)
	}
	if n.Status() != StatusArchived {
		t.Errorf("status: got %s", n.Status())
	}
	sameEvents(t, n.PullDomainEvents(), NoteArchivedEvent{NoteID: n.ID().Value()})
}

func TestArchiveCannotArchiveTwice(t *testing.T) {
	if refusalType(t, anArchivedNote(t).Archive(owner)) != "NoteAlreadyArchived" {
		t.Error("archiving twice is refused")
	}
}

func TestRestoreRestoresAnArchivedNoteAndRecordsNoteRestored(t *testing.T) {
	n := anArchivedNote(t)
	if err := n.Restore(owner); err != nil {
		t.Fatalf("Restore: %v", err)
	}
	if n.Status() != StatusActive {
		t.Errorf("status: got %s", n.Status())
	}
	sameEvents(t, n.PullDomainEvents(), NoteRestoredEvent{NoteID: n.ID().Value()})
}

func TestRestoreCannotRestoreAnActiveNote(t *testing.T) {
	if refusalType(t, aNote(t).Restore(owner)) != "NoteNotArchived" {
		t.Error("only an archived note can be restored")
	}
}

func TestArchiveAndRestoreAreReservedToTheOwner(t *testing.T) {
	if refusalType(t, aNote(t).Archive(stranger)) != "NotNoteOwner" {
		t.Error("a stranger cannot archive")
	}
	if refusalType(t, anArchivedNote(t).Restore(stranger)) != "NotNoteOwner" {
		t.Error("a stranger cannot restore")
	}
}

// Sharing

func TestShareWithSharesWithAnotherAccountAndRecordsNoteShared(t *testing.T) {
	n := aNote(t)
	if err := n.ShareWith(owner, stranger); err != nil {
		t.Fatalf("ShareWith: %v", err)
	}
	if !reflect.DeepEqual(n.SharedWith(), []string{"bob"}) {
		t.Errorf("shared with: got %v", n.SharedWith())
	}
	if !n.IsVisibleTo(stranger) || !n.IsVisibleTo(owner) {
		t.Error("the note is visible to its owner and to whom it was shared with")
	}
	if n.IsVisibleTo(domain.NewID("carol")) {
		t.Error("the note is invisible to anyone else")
	}
	sameEvents(t, n.PullDomainEvents(), NoteSharedEvent{NoteID: n.ID().Value(), Title: "Groceries", OwnerID: "alice", RecipientID: "bob"})
}

func TestShareWithCannotShareWithYourself(t *testing.T) {
	if refusalType(t, aNote(t).ShareWith(owner, owner)) != "CannotShareWithSelf" {
		t.Error("sharing with yourself is refused")
	}
}

func TestShareWithCannotShareTwiceWithTheSameAccount(t *testing.T) {
	n := aNote(t)
	if err := n.ShareWith(owner, stranger); err != nil {
		t.Fatalf("ShareWith: %v", err)
	}
	if refusalType(t, n.ShareWith(owner, stranger)) != "NoteAlreadyShared" {
		t.Error("sharing twice is refused")
	}
}

func TestShareWithCannotShareAnArchivedNote(t *testing.T) {
	if refusalType(t, anArchivedNote(t).ShareWith(owner, stranger)) != "NoteArchived" {
		t.Error("an archived note cannot be shared")
	}
}

func TestShareWithIsReservedToTheOwner(t *testing.T) {
	if refusalType(t, aNote(t).ShareWith(stranger, domain.NewID("carol"))) != "NotNoteOwner" {
		t.Error("a stranger cannot share")
	}
}

// Persistence round trip

func TestFromSnapshotRebuildsTheFullStateWithoutRecordingAnyEvent(t *testing.T) {
	snapshot := Snapshot{
		ID: "n1", OwnerID: "alice", Title: "Groceries", Content: "Milk",
		Status: StatusArchived, SharedWith: []string{"bob"}, Version: 4,
	}

	n := FromSnapshot(snapshot)

	if !reflect.DeepEqual(n.ToSnapshot(), snapshot) {
		t.Errorf("snapshot: got %+v, want %+v", n.ToSnapshot(), snapshot)
	}
	if n.Version() != 4 {
		t.Errorf("version: got %d, want 4", n.Version())
	}
	sameEvents(t, n.PullDomainEvents())
}

func TestToSnapshotFromSnapshotGivesBackAnEqualNote(t *testing.T) {
	n := aNote(t)
	if err := n.ShareWith(owner, stranger); err != nil {
		t.Fatalf("ShareWith: %v", err)
	}
	rebuilt := FromSnapshot(n.ToSnapshot())
	if !rebuilt.Equals(n.Entity) {
		t.Error("the rebuilt note is the same thing")
	}
	if !reflect.DeepEqual(rebuilt.ToSnapshot(), n.ToSnapshot()) {
		t.Errorf("snapshot: got %+v, want %+v", rebuilt.ToSnapshot(), n.ToSnapshot())
	}
}

func TestASnapshotIsACopyOfTheState(t *testing.T) {
	n := aNote(t)
	if err := n.ShareWith(owner, stranger); err != nil {
		t.Fatalf("ShareWith: %v", err)
	}
	snapshot := n.ToSnapshot()
	snapshot.SharedWith[0] = "mallory"
	n.SharedWith()[0] = "mallory"
	if !reflect.DeepEqual(n.SharedWith(), []string{"bob"}) {
		t.Errorf("the aggregate's state leaked, got %v", n.SharedWith())
	}
}

func TestFromSnapshotRefusesACorruptedSnapshot(t *testing.T) {
	// A corrupted snapshot is a programming error: FromSnapshot panics, and the message says which note.
	message := func(snapshot Snapshot) (message string) {
		defer func() {
			recovered := recover()
			if recovered == nil {
				t.Error("expected a panic")
			}
			message, _ = recovered.(string)
		}()
		FromSnapshot(snapshot)
		return ""
	}
	blank := Snapshot{ID: "n1", OwnerID: "alice", Title: "  ", Content: "", Status: StatusActive}
	if got := message(blank); !strings.Contains(got, "corrupted note n1") {
		t.Errorf("a blank title: got %q", got)
	}
	unknown := Snapshot{ID: "n1", OwnerID: "alice", Title: "Groceries", Status: Status("LOST")}
	if got := message(unknown); !strings.Contains(got, "corrupted note n1") || !strings.Contains(got, "LOST") {
		t.Errorf("an unknown status: got %q", got)
	}
}
