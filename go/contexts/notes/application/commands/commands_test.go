package commands

// The handlers of one aggregate share one test file, and its fixture: the in-memory
// repository is the double, and a recording bus says what was published. A rule written as
// RequireSignedIn() inside Execute() is tested through Execute().

import (
	"reflect"
	"testing"

	"clean-ddd/architecture/application"
	"clean-ddd/architecture/domain"
	"clean-ddd/architecture/infrastructure"
	"clean-ddd/contexts/notes/domain/note"
	notesinfra "clean-ddd/contexts/notes/infrastructure"
)

// recordingBus remembers what the handlers published, in order; nothing is dispatched.
type recordingBus struct{ published []domain.Event }

func (*recordingBus) Connect() error { return nil }

func (b *recordingBus) Publish(event domain.Event, context *application.ExecutionContext) *application.Operation {
	b.published = append(b.published, event)
	return application.NewOperation(event, context)
}

func (*recordingBus) Dispatch(*application.Operation)          {}
func (*recordingBus) Subscribe(string, application.Subscriber) {}

// directory: every account the tests talk about exists; the port itself is covered by note_sharing_test.go.
type directory struct{}

func (directory) Exists(accountID string) (bool, error) {
	return accountID == "alice" || accountID == "bob" || accountID == "carol", nil
}

type fixture struct {
	t          *testing.T
	store      *infrastructure.InMemoryDataSource[note.Snapshot]
	repository *notesinfra.InMemoryNoteRepository
	bus        *recordingBus
	sharing    *note.Sharing
}

func newFixture(t *testing.T) *fixture {
	store := infrastructure.NewInMemoryDataSource[note.Snapshot]()
	return &fixture{
		t:          t,
		store:      store,
		repository: notesinfra.NewInMemoryNoteRepository(store),
		bus:        &recordingBus{},
		sharing:    note.NewSharing(directory{}),
	}
}

func (f *fixture) contextFor(subjectID string) *application.ExecutionContext {
	return f.contextAs(subjectID, "USER")
}

func (f *fixture) contextAs(subjectID, role string) *application.ExecutionContext {
	return application.NewExecutionContext(application.Options{
		TraceID: "trace", EventBus: f.bus, Auth: application.Auth{SubjectID: subjectID, Role: role},
	})
}

func (f *fixture) aNoteOwnedBy(ownerID string) string {
	f.t.Helper()
	noteID, err := NewCreateNoteHandler(f.repository).Execute(CreateNoteCommandEvent{Title: "Groceries", Content: "Milk"}, f.contextFor(ownerID))
	if err != nil {
		f.t.Fatalf("creating a note: %v", err)
	}
	f.bus.published = nil
	return noteID
}

func (f *fixture) stored(noteID string) note.Snapshot {
	f.t.Helper()
	snapshot, ok := f.store.Get(noteID)
	if !ok {
		f.t.Fatalf("note %s is not stored", noteID)
	}
	return snapshot
}

func (f *fixture) storedCount() int { return len(f.store.All()) }

// withSharing normalises an unshared note's SharedWith, which the aggregate leaves nil.
func withSharing(snapshot note.Snapshot) note.Snapshot {
	if snapshot.SharedWith == nil {
		snapshot.SharedWith = []string{}
	}
	return snapshot
}

func refusalType(t *testing.T, err error) string {
	t.Helper()
	refused, ok := domain.Refusal(err)
	if !ok {
		t.Fatalf("expected a refusal, got %v", err)
	}
	return refused.Type
}

func samePublished(t *testing.T, got []domain.Event, want ...domain.Event) {
	t.Helper()
	if len(got) == 0 && len(want) == 0 {
		return
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("published: got %v, want %v", got, want)
	}
}

// CreateNote

func TestCreateNoteSavesANewActiveNoteOwnedByTheCallerAndPublishesNoteCreated(t *testing.T) {
	notes := newFixture(t)

	noteID, err := NewCreateNoteHandler(notes.repository).Execute(CreateNoteCommandEvent{Title: "Groceries", Content: "Milk"}, notes.contextFor("alice"))
	if err != nil {
		t.Fatalf("unexpected refusal: %v", err)
	}

	want := note.Snapshot{ID: noteID, OwnerID: "alice", Title: "Groceries", Content: "Milk", Status: note.StatusActive, SharedWith: []string{}, Version: 1}
	if got := withSharing(notes.stored(noteID)); !reflect.DeepEqual(got, want) {
		t.Errorf("stored: got %+v, want %+v", got, want)
	}
	samePublished(t, notes.bus.published, note.NoteCreatedEvent{NoteID: noteID, OwnerID: "alice", Title: "Groceries"})
}

func TestCreateNoteRefusesABlankTitleAndSavesNothing(t *testing.T) {
	notes := newFixture(t)

	_, err := NewCreateNoteHandler(notes.repository).Execute(CreateNoteCommandEvent{Title: "   ", Content: "Milk"}, notes.contextFor("alice"))

	if refusalType(t, err) != "BlankNoteTitle" {
		t.Errorf("got %v", err)
	}
	if notes.storedCount() != 0 {
		t.Error("nothing should be stored")
	}
	samePublished(t, notes.bus.published)
}

func TestCreateNoteRefusesAnAnonymousCaller(t *testing.T) {
	notes := newFixture(t)

	_, err := NewCreateNoteHandler(notes.repository).Execute(CreateNoteCommandEvent{Title: "Groceries", Content: "Milk"}, notes.contextAs("", "GUEST"))

	if refusalType(t, err) != domain.TypeNotAllowed {
		t.Errorf("got %v", err)
	}
	if notes.storedCount() != 0 {
		t.Error("nothing should be stored")
	}
}

func TestCreateNotePublishedOnTheBusEndsAsASucceededOperationCarryingTheID(t *testing.T) {
	notes := newFixture(t)
	operation := application.NewOperation(CreateNoteCommandEvent{Title: "Groceries", Content: "Milk"}, notes.contextFor("alice"))

	subscription := application.Command[CreateNoteCommandEvent, string](NewCreateNoteHandler(notes.repository))
	subscription.Handlers[0].Handle(operation)

	if subscription.Channel != "CreateNoteCommandEvent" {
		t.Errorf("channel: got %q", subscription.Channel)
	}
	if operation.Status != application.StatusSuccess {
		t.Fatalf("status: got %s (%v)", operation.Status, operation.Error)
	}
	noteID, ok := operation.Result.(string)
	if !ok || notes.stored(noteID).OwnerID != "alice" {
		t.Errorf("result: got %v, want the id of the stored note", operation.Result)
	}
}

// ShareNote

func TestShareNoteLetsTheOwnerShareANoteAndPublishesNoteShared(t *testing.T) {
	notes := newFixture(t)
	noteID := notes.aNoteOwnedBy("alice")

	_, err := NewShareNoteHandler(notes.repository, notes.sharing).Execute(ShareNoteCommandEvent{NoteID: noteID, RecipientID: "bob"}, notes.contextFor("alice"))
	if err != nil {
		t.Fatalf("unexpected refusal: %v", err)
	}

	if shared := notes.stored(noteID).SharedWith; !reflect.DeepEqual(shared, []string{"bob"}) {
		t.Errorf("shared with: got %v", shared)
	}
	samePublished(t, notes.bus.published, note.NoteSharedEvent{NoteID: noteID, Title: "Groceries", OwnerID: "alice", RecipientID: "bob"})
}

func TestShareNoteRefusesACallerWhoDoesNotOwnTheNote(t *testing.T) {
	notes := newFixture(t)
	noteID := notes.aNoteOwnedBy("alice")

	_, err := NewShareNoteHandler(notes.repository, notes.sharing).Execute(ShareNoteCommandEvent{NoteID: noteID, RecipientID: "carol"}, notes.contextFor("bob"))

	if refusalType(t, err) != "NotNoteOwner" {
		t.Errorf("got %v", err)
	}
	if shared := notes.stored(noteID).SharedWith; len(shared) != 0 {
		t.Errorf("shared with: got %v, want nobody", shared)
	}
	samePublished(t, notes.bus.published)
}

func TestShareNoteFailsOnAnUnknownNote(t *testing.T) {
	notes := newFixture(t)

	_, err := NewShareNoteHandler(notes.repository, notes.sharing).Execute(ShareNoteCommandEvent{NoteID: "nope", RecipientID: "bob"}, notes.contextFor("alice"))

	if refusalType(t, err) != "NoteNotFound" {
		t.Errorf("got %v", err)
	}
}

func TestShareNoteRefusesARecipientTheDirectoryDoesNotKnow(t *testing.T) {
	notes := newFixture(t)
	noteID := notes.aNoteOwnedBy("alice")

	_, err := NewShareNoteHandler(notes.repository, notes.sharing).Execute(ShareNoteCommandEvent{NoteID: noteID, RecipientID: "mallory"}, notes.contextFor("alice"))

	if refusalType(t, err) != "RecipientNotFound" {
		t.Errorf("got %v", err)
	}
	samePublished(t, notes.bus.published)
}

// ArchiveNote

func TestArchiveNoteArchivesTheNote(t *testing.T) {
	notes := newFixture(t)
	noteID := notes.aNoteOwnedBy("alice")

	_, err := NewArchiveNoteHandler(notes.repository).Execute(ArchiveNoteCommandEvent{NoteID: noteID}, notes.contextFor("alice"))
	if err != nil {
		t.Fatalf("unexpected refusal: %v", err)
	}

	if status := notes.stored(noteID).Status; status != note.StatusArchived {
		t.Errorf("status: got %s", status)
	}
	samePublished(t, notes.bus.published, note.NoteArchivedEvent{NoteID: noteID})
}

func TestArchiveNoteRefusesACallerWhoDoesNotOwnTheNote(t *testing.T) {
	notes := newFixture(t)
	noteID := notes.aNoteOwnedBy("alice")

	_, err := NewArchiveNoteHandler(notes.repository).Execute(ArchiveNoteCommandEvent{NoteID: noteID}, notes.contextFor("bob"))

	if refusalType(t, err) != "NotNoteOwner" {
		t.Errorf("got %v", err)
	}
	if status := notes.stored(noteID).Status; status != note.StatusActive {
		t.Errorf("status: got %s, want ACTIVE", status)
	}
}

func TestArchiveNoteFailsOnAnUnknownNote(t *testing.T) {
	notes := newFixture(t)
	_, err := NewArchiveNoteHandler(notes.repository).Execute(ArchiveNoteCommandEvent{NoteID: "nope"}, notes.contextFor("alice"))
	if refusalType(t, err) != "NoteNotFound" {
		t.Errorf("got %v", err)
	}
}

// EditNote

func TestEditNoteLetsTheOwnerChangeTitleAndContent(t *testing.T) {
	notes := newFixture(t)
	noteID := notes.aNoteOwnedBy("alice")

	_, err := NewEditNoteHandler(notes.repository).Execute(EditNoteCommandEvent{NoteID: noteID, Title: "Errands", Content: "Milk, bread"}, notes.contextFor("alice"))
	if err != nil {
		t.Fatalf("unexpected refusal: %v", err)
	}

	if stored := notes.stored(noteID); stored.Title != "Errands" || stored.Content != "Milk, bread" {
		t.Errorf("stored: got %q %q", stored.Title, stored.Content)
	}
	if version := notes.stored(noteID).Version; version != 2 {
		t.Errorf("version: got %d, want 2 after a second save", version)
	}
	samePublished(t, notes.bus.published, note.NoteEditedEvent{NoteID: noteID, Title: "Errands"})
}

func TestEditNoteRefusesToEditAnArchivedNote(t *testing.T) {
	notes := newFixture(t)
	noteID := notes.aNoteOwnedBy("alice")
	if _, err := NewArchiveNoteHandler(notes.repository).Execute(ArchiveNoteCommandEvent{NoteID: noteID}, notes.contextFor("alice")); err != nil {
		t.Fatalf("archiving: %v", err)
	}

	_, err := NewEditNoteHandler(notes.repository).Execute(EditNoteCommandEvent{NoteID: noteID, Title: "Errands", Content: "Milk"}, notes.contextFor("alice"))

	if refusalType(t, err) != "NoteArchived" {
		t.Errorf("got %v", err)
	}
	if title := notes.stored(noteID).Title; title != "Groceries" {
		t.Errorf("title: got %q, want Groceries", title)
	}
}

func TestEditNoteFailsOnAnUnknownNote(t *testing.T) {
	notes := newFixture(t)
	_, err := NewEditNoteHandler(notes.repository).Execute(EditNoteCommandEvent{NoteID: "nope", Title: "Errands"}, notes.contextFor("alice"))
	if refusalType(t, err) != "NoteNotFound" {
		t.Errorf("got %v", err)
	}
}

// PinNote

func TestPinNoteLetsTheOwnerPinANoteAndPublishesNotePinned(t *testing.T) {
	notes := newFixture(t)
	noteID := notes.aNoteOwnedBy("alice")

	_, err := NewPinNoteHandler(notes.repository).Execute(PinNoteCommandEvent{NoteID: noteID}, notes.contextFor("alice"))
	if err != nil {
		t.Fatalf("unexpected refusal: %v", err)
	}

	if !notes.stored(noteID).Pinned {
		t.Error("the stored note is pinned")
	}
	samePublished(t, notes.bus.published, note.NotePinnedEvent{NoteID: noteID})
}

func TestPinNoteRefusesACallerWhoDoesNotOwnTheNote(t *testing.T) {
	notes := newFixture(t)
	noteID := notes.aNoteOwnedBy("alice")

	_, err := NewPinNoteHandler(notes.repository).Execute(PinNoteCommandEvent{NoteID: noteID}, notes.contextFor("bob"))

	if refusalType(t, err) != "NotNoteOwner" {
		t.Errorf("got %v", err)
	}
	if notes.stored(noteID).Pinned {
		t.Error("the note should not be pinned")
	}
	samePublished(t, notes.bus.published)
}

func TestPinNoteRefusesToPinAnArchivedNote(t *testing.T) {
	notes := newFixture(t)
	noteID := notes.aNoteOwnedBy("alice")
	if _, err := NewArchiveNoteHandler(notes.repository).Execute(ArchiveNoteCommandEvent{NoteID: noteID}, notes.contextFor("alice")); err != nil {
		t.Fatalf("archiving: %v", err)
	}
	notes.bus.published = nil

	_, err := NewPinNoteHandler(notes.repository).Execute(PinNoteCommandEvent{NoteID: noteID}, notes.contextFor("alice"))

	if refusalType(t, err) != "NoteArchived" {
		t.Errorf("got %v", err)
	}
	if notes.stored(noteID).Pinned {
		t.Error("the note should not be pinned")
	}
	samePublished(t, notes.bus.published)
}

func TestPinNoteFailsOnAnUnknownNote(t *testing.T) {
	notes := newFixture(t)
	_, err := NewPinNoteHandler(notes.repository).Execute(PinNoteCommandEvent{NoteID: "nope"}, notes.contextFor("alice"))
	if refusalType(t, err) != "NoteNotFound" {
		t.Errorf("got %v", err)
	}
}

// UnpinNote

func TestUnpinNoteUnpinsAPinnedNoteAndPublishesNoteUnpinned(t *testing.T) {
	notes := newFixture(t)
	noteID := notes.aNoteOwnedBy("alice")
	if _, err := NewPinNoteHandler(notes.repository).Execute(PinNoteCommandEvent{NoteID: noteID}, notes.contextFor("alice")); err != nil {
		t.Fatalf("pinning: %v", err)
	}
	notes.bus.published = nil

	_, err := NewUnpinNoteHandler(notes.repository).Execute(UnpinNoteCommandEvent{NoteID: noteID}, notes.contextFor("alice"))
	if err != nil {
		t.Fatalf("unexpected refusal: %v", err)
	}

	if notes.stored(noteID).Pinned {
		t.Error("the stored note is no longer pinned")
	}
	samePublished(t, notes.bus.published, note.NoteUnpinnedEvent{NoteID: noteID})
}

func TestUnpinNoteRefusesToUnpinANoteThatIsNotPinned(t *testing.T) {
	notes := newFixture(t)
	noteID := notes.aNoteOwnedBy("alice")

	_, err := NewUnpinNoteHandler(notes.repository).Execute(UnpinNoteCommandEvent{NoteID: noteID}, notes.contextFor("alice"))

	if refusalType(t, err) != "NoteNotPinned" {
		t.Errorf("got %v", err)
	}
	samePublished(t, notes.bus.published)
}

func TestUnpinNoteFailsOnAnUnknownNote(t *testing.T) {
	notes := newFixture(t)
	_, err := NewUnpinNoteHandler(notes.repository).Execute(UnpinNoteCommandEvent{NoteID: "nope"}, notes.contextFor("alice"))
	if refusalType(t, err) != "NoteNotFound" {
		t.Errorf("got %v", err)
	}
}

// RestoreNote

func TestRestoreNoteRestoresAnArchivedNote(t *testing.T) {
	notes := newFixture(t)
	noteID := notes.aNoteOwnedBy("alice")
	if _, err := NewArchiveNoteHandler(notes.repository).Execute(ArchiveNoteCommandEvent{NoteID: noteID}, notes.contextFor("alice")); err != nil {
		t.Fatalf("archiving: %v", err)
	}
	notes.bus.published = nil

	_, err := NewRestoreNoteHandler(notes.repository).Execute(RestoreNoteCommandEvent{NoteID: noteID}, notes.contextFor("alice"))
	if err != nil {
		t.Fatalf("unexpected refusal: %v", err)
	}

	if status := notes.stored(noteID).Status; status != note.StatusActive {
		t.Errorf("status: got %s, want ACTIVE", status)
	}
	samePublished(t, notes.bus.published, note.NoteRestoredEvent{NoteID: noteID})
}

func TestRestoreNoteRefusesToRestoreANoteThatIsNotArchived(t *testing.T) {
	notes := newFixture(t)
	noteID := notes.aNoteOwnedBy("alice")

	_, err := NewRestoreNoteHandler(notes.repository).Execute(RestoreNoteCommandEvent{NoteID: noteID}, notes.contextFor("alice"))

	if refusalType(t, err) != "NoteNotArchived" {
		t.Errorf("got %v", err)
	}
}

func TestRestoreNoteFailsOnAnUnknownNote(t *testing.T) {
	notes := newFixture(t)
	_, err := NewRestoreNoteHandler(notes.repository).Execute(RestoreNoteCommandEvent{NoteID: "nope"}, notes.contextFor("alice"))
	if refusalType(t, err) != "NoteNotFound" {
		t.Errorf("got %v", err)
	}
}
