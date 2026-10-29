package queries

// A query handler that holds a visibility rule has its happy path and its refusals tested.

import (
	"reflect"
	"testing"

	"clean-ddd/architecture/application"
	"clean-ddd/architecture/domain"
	"clean-ddd/architecture/infrastructure"
	"clean-ddd/contexts/notes/domain/note"
	notesinfra "clean-ddd/contexts/notes/infrastructure"
)

type noBus struct{}

func (noBus) Connect() error { return nil }
func (noBus) Publish(domain.Event, *application.ExecutionContext) *application.Operation {
	panic("not used")
}
func (noBus) PublishWithID(domain.Event, *application.ExecutionContext, string) *application.Operation {
	panic("not used")
}
func (noBus) Dispatch(*application.Operation)          {}
func (noBus) Subscribe(string, application.Subscriber) {}

func contextFor(subjectID, role string) *application.ExecutionContext {
	return application.NewExecutionContext(application.Options{
		TraceID: "trace", EventBus: noBus{}, Auth: application.Auth{SubjectID: subjectID, Role: role},
	})
}

type fixture struct {
	store   *infrastructure.InMemoryDataSource[note.Snapshot]
	handler *GetNoteHandler
}

func newFixture() fixture {
	store := infrastructure.NewInMemoryDataSource[note.Snapshot]()
	return fixture{store: store, handler: NewGetNoteHandler(notesinfra.NewInMemoryNoteQueries(store))}
}

// aNoteOwnedBy writes a note through the domain and the repository: the query reads what they stored.
func (f fixture) aNoteOwnedBy(t *testing.T, ownerID string, sharedWith ...string) string {
	t.Helper()
	n, err := note.Create(note.NewNote{OwnerID: ownerID, Title: "Groceries", Content: "Milk"})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	for _, recipient := range sharedWith {
		if err := n.ShareWith(domain.NewID(ownerID), domain.NewID(recipient)); err != nil {
			t.Fatalf("ShareWith: %v", err)
		}
	}
	if err := notesinfra.NewInMemoryNoteRepository(f.store).Save(n); err != nil {
		t.Fatalf("Save: %v", err)
	}
	return n.ID().Value()
}

func TestGetNoteShowsTheNoteToItsOwnerAndToWhomItWasSharedWith(t *testing.T) {
	notes := newFixture()
	noteID := notes.aNoteOwnedBy(t, "alice", "bob")

	for _, reader := range []string{"alice", "bob"} {
		detail, err := application.Query[string, note.Detail](notes.handler, noteID, contextFor(reader, "USER"))
		if err != nil {
			t.Fatalf("%s: unexpected refusal %v", reader, err)
		}
		if detail.ID != noteID || !reflect.DeepEqual(detail.SharedWith, []string{"bob"}) {
			t.Errorf("%s: got %+v", reader, detail)
		}
	}
}

func TestGetNoteANoteSomeoneElseOwnsAndDidNotShareDoesNotExistAsFarAsYouKnow(t *testing.T) {
	notes := newFixture()
	noteID := notes.aNoteOwnedBy(t, "alice", "bob")

	_, err := application.Query[string, note.Detail](notes.handler, noteID, contextFor("carol", "USER"))

	if refused, ok := domain.Refusal(err); !ok || refused.Type != "NoteNotFound" {
		t.Errorf("got %v, want NoteNotFound", err)
	}
}

func TestGetNoteAnUnknownNoteIsNotFound(t *testing.T) {
	notes := newFixture()
	_, err := application.Query[string, note.Detail](notes.handler, "nope", contextFor("alice", "USER"))
	if refused, ok := domain.Refusal(err); !ok || refused.Type != "NoteNotFound" {
		t.Errorf("got %v, want NoteNotFound", err)
	}
}

func TestGetNoteRefusesAnAnonymousReader(t *testing.T) {
	notes := newFixture()
	noteID := notes.aNoteOwnedBy(t, "alice")

	_, err := application.Query[string, note.Detail](notes.handler, noteID, contextFor("", "GUEST"))

	if !domain.IsNotAllowed(err) {
		t.Errorf("got %v, want NotAllowed", err)
	}
}

func TestGetMyNotesListsTheCallersNotesOnly(t *testing.T) {
	notes := newFixture()
	first := notes.aNoteOwnedBy(t, "alice")
	notes.aNoteOwnedBy(t, "bob")
	second := notes.aNoteOwnedBy(t, "alice")

	items, err := application.Query[application.NoParams, []note.ListItem](NewGetMyNotesHandler(notesinfra.NewInMemoryNoteQueries(notes.store)), application.NoParams{}, contextFor("alice", "USER"))
	if err != nil {
		t.Fatalf("unexpected refusal: %v", err)
	}
	if len(items) != 2 || items[0].ID != first || items[1].ID != second {
		t.Errorf("got %+v", items)
	}
	if _, err := application.Query[application.NoParams, []note.ListItem](NewGetMyNotesHandler(notesinfra.NewInMemoryNoteQueries(notes.store)), application.NoParams{}, contextFor("", "")); !domain.IsNotAllowed(err) {
		t.Errorf("anonymous: got %v, want NotAllowed", err)
	}
}

func TestGetNotesSharedWithMeListsWhatOthersSharedWithTheCaller(t *testing.T) {
	notes := newFixture()
	shared := notes.aNoteOwnedBy(t, "alice", "bob")
	notes.aNoteOwnedBy(t, "alice")

	items, err := application.Query[application.NoParams, []note.SharedListItem](NewGetNotesSharedWithMeHandler(notesinfra.NewInMemoryNoteQueries(notes.store)), application.NoParams{}, contextFor("bob", "USER"))
	if err != nil {
		t.Fatalf("unexpected refusal: %v", err)
	}
	if len(items) != 1 || items[0].ID != shared || items[0].OwnerID != "alice" {
		t.Errorf("got %+v", items)
	}
	if _, err := application.Query[application.NoParams, []note.SharedListItem](NewGetNotesSharedWithMeHandler(notesinfra.NewInMemoryNoteQueries(notes.store)), application.NoParams{}, contextFor("", "")); !domain.IsNotAllowed(err) {
		t.Errorf("anonymous: got %v, want NotAllowed", err)
	}
}
