package infrastructure

// A contract test: the expectations belong to the ports, so every adapter of a port runs the
// same ones. Add an adapter (a Postgres one, say) by adding an entry to adapters; if it passes
// here, the use cases will not notice the change. Two adapters today: the in-memory pair and
// the SQLite pair. The repository and the queries are tested together because they are two
// views of one store: what the repository saves is what the queries must show.

import (
	"reflect"
	"testing"

	"clean-ddd/architecture/domain"
	"clean-ddd/architecture/infrastructure"
	"clean-ddd/contexts/notes/domain/note"
)

type persistence struct {
	repository note.Repository
	queries    note.Queries
}

var adapters = []struct {
	name string
	open func(t *testing.T) persistence
}{
	{"in-memory", func(*testing.T) persistence {
		store := infrastructure.NewInMemoryDataSource[note.Snapshot]()
		return persistence{NewInMemoryNoteRepository(store), NewInMemoryNoteQueries(store)}
	}},
	{"sqlite", func(t *testing.T) persistence {
		t.Helper()
		db, err := InMemoryDatabase()
		if err != nil {
			t.Fatalf("opening the database: %v", err)
		}
		t.Cleanup(func() { _ = db.Close() })
		repository, err := NewSqliteNoteRepository(db)
		if err != nil {
			t.Fatalf("repository: %v", err)
		}
		queries, err := NewSqliteNoteQueries(db)
		if err != nil {
			t.Fatalf("queries: %v", err)
		}
		return persistence{repository, queries}
	}},
}

// contract runs one expectation over every adapter.
func contract(t *testing.T, expectation func(t *testing.T, p persistence)) {
	t.Helper()
	for _, adapter := range adapters {
		t.Run(adapter.name, func(t *testing.T) { expectation(t, adapter.open(t)) })
	}
}

var alice, bob = domain.NewID("alice"), domain.NewID("bob")

func aNote(t *testing.T, owner domain.ID, title string, content ...string) *note.Note {
	t.Helper()
	body := "content of " + title
	if len(content) > 0 {
		body = content[0]
	}
	n, err := note.Create(note.NewNote{OwnerID: owner.Value(), Title: title, Content: body})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	return n
}

func save(t *testing.T, repository note.Repository, n *note.Note) {
	t.Helper()
	if err := repository.Save(n); err != nil {
		t.Fatalf("Save: %v", err)
	}
}

func find(t *testing.T, repository note.Repository, id string) *note.Note {
	t.Helper()
	found, err := repository.FindByID(id)
	if err != nil {
		t.Fatalf("FindByID: %v", err)
	}
	if found == nil {
		t.Fatalf("note %s should be stored", id)
	}
	return found
}

func mustDo(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatalf("unexpected refusal: %v", err)
	}
}

// The three reads of the queries port, with their store failure turned into a test failure.

func (p persistence) detailOf(t *testing.T, id string) *note.Detail {
	t.Helper()
	detail, err := p.queries.FindByID(id)
	mustDo(t, err)
	return detail
}

func (p persistence) notesOf(t *testing.T, ownerID string) []note.ListItem {
	t.Helper()
	items, err := p.queries.FindByOwner(ownerID)
	mustDo(t, err)
	return items
}

func (p persistence) sharedWith(t *testing.T, accountID string) []note.SharedListItem {
	t.Helper()
	items, err := p.queries.FindSharedWith(accountID)
	mustDo(t, err)
	return items
}

// withSharing normalises an unshared note's SharedWith, nil from the aggregate and empty from a row.
func withSharing(snapshot note.Snapshot) note.Snapshot {
	if snapshot.SharedWith == nil {
		snapshot.SharedWith = []string{}
	}
	return snapshot
}

// The repository

func TestRepositoryGivesBackAnEqualAggregate(t *testing.T) {
	contract(t, func(t *testing.T, p persistence) {
		n := aNote(t, alice, "Groceries")
		mustDo(t, n.ShareWith(alice, bob))
		mustDo(t, n.Pin(alice))
		save(t, p.repository, n)

		found := find(t, p.repository, n.ID().Value())
		want := note.Snapshot{
			ID: n.ID().Value(), OwnerID: "alice", Title: "Groceries", Content: "content of Groceries",
			Status: note.StatusActive, Pinned: true, SharedWith: []string{"bob"}, Version: n.Version() + 1,
		}
		if got := found.ToSnapshot(); !reflect.DeepEqual(got, want) {
			t.Errorf("got %+v, want %+v", got, want)
		}
		if !found.Equals(n.Entity) {
			t.Error("the note read back is the same thing")
		}
	})
}

func TestRepositoryStoresVersionPlusOneAndRefusesAnAggregateNoLongerAtTheStoredVersion(t *testing.T) {
	contract(t, func(t *testing.T, p persistence) {
		n := aNote(t, alice, "Shared draft")
		if n.Version() != 0 {
			t.Fatalf("a new aggregate is version 0, got %d", n.Version())
		}
		save(t, p.repository, n)

		// Two writers read the same version.
		mine := find(t, p.repository, n.ID().Value())
		theirs := find(t, p.repository, n.ID().Value())
		if mine.Version() != 1 {
			t.Errorf("version read: got %d, want 1", mine.Version())
		}

		mustDo(t, mine.Edit(alice, "Mine", "first"))
		save(t, p.repository, mine)

		mustDo(t, theirs.Edit(alice, "Theirs", "second"))
		refused := p.repository.Save(theirs)
		if !domain.IsConcurrencyConflict(refused) {
			t.Errorf("the second writer should be refused, got %v", refused)
		}
		if exception, _ := domain.Refusal(refused); exception != nil && exception.Service != note.Service {
			t.Errorf("the refusal names the context, got %q", exception.Service)
		}

		stored := find(t, p.repository, n.ID().Value())
		if stored.Title() != "Mine" || stored.Version() != 2 {
			t.Errorf("stored: got %q at version %d, want Mine at 2", stored.Title(), stored.Version())
		}
	})
}

func TestRepositoryRefusesToSaveTheOriginalInstanceOverItsOwnLaterVersion(t *testing.T) {
	contract(t, func(t *testing.T, p persistence) {
		n := aNote(t, alice, "Draft")
		save(t, p.repository, n)
		// The instance saved is still at version 0, the store at 1: saving it again is stale.
		if err := p.repository.Save(n); !domain.IsConcurrencyConflict(err) {
			t.Errorf("got %v, want a ConcurrencyConflict", err)
		}
	})
}

func TestRepositoryAnswersNilForAnUnknownID(t *testing.T) {
	contract(t, func(t *testing.T, p persistence) {
		found, err := p.repository.FindByID("nobody")
		if err != nil || found != nil {
			t.Errorf("got (%v, %v), want (nil, nil)", found, err)
		}
	})
}

func TestRepositorySavingAgainReplacesItDoesNotDuplicate(t *testing.T) {
	contract(t, func(t *testing.T, p persistence) {
		n := aNote(t, alice, "Draft")
		save(t, p.repository, n)
		// As a handler does: read it back, change it, save it; the instance saved before is stale.
		reread := find(t, p.repository, n.ID().Value())
		mustDo(t, reread.Edit(alice, "Final", "done"))
		mustDo(t, reread.Archive(alice))
		save(t, p.repository, reread)

		found := find(t, p.repository, n.ID().Value())
		if found.Title() != "Final" || found.Status() != note.StatusArchived {
			t.Errorf("got %q %s, want Final ARCHIVED", found.Title(), found.Status())
		}
		if items := p.notesOf(t, alice.Value()); len(items) != 1 {
			t.Errorf("owner's notes: got %d, want 1", len(items))
		}
	})
}

func TestRepositoryRebuildsWithoutRecordingEvents(t *testing.T) {
	contract(t, func(t *testing.T, p persistence) {
		n := aNote(t, alice, "Quiet")
		save(t, p.repository, n)

		found := find(t, p.repository, n.ID().Value())
		if events := found.PullDomainEvents(); len(events) != 0 {
			t.Errorf("rebuilding is not a business fact, got %v", events)
		}
		if shared := withSharing(found.ToSnapshot()).SharedWith; len(shared) != 0 {
			t.Errorf("an unshared note reads back unshared, got %v", shared)
		}
	})
}

// The queries

func TestQueriesShowTheDetailOfASavedNote(t *testing.T) {
	contract(t, func(t *testing.T, p persistence) {
		n := aNote(t, alice, "Groceries", "milk")
		mustDo(t, n.ShareWith(alice, bob))
		mustDo(t, n.Pin(alice))
		save(t, p.repository, n)

		want := &note.Detail{ID: n.ID().Value(), Title: "Groceries", Content: "milk", Status: note.StatusActive, Pinned: true, OwnerID: "alice", SharedWith: []string{"bob"}}
		if got := p.detailOf(t, n.ID().Value()); !reflect.DeepEqual(got, want) {
			t.Errorf("got %+v, want %+v", got, want)
		}
		if got := p.detailOf(t, "nobody"); got != nil {
			t.Errorf("an unknown id: got %+v, want nil", got)
		}
	})
}

func TestQueriesListAnOwnersNotesAndOnlyTheirsInTheOrderTheyWereSaved(t *testing.T) {
	contract(t, func(t *testing.T, p persistence) {
		first := aNote(t, alice, "First")
		second := aNote(t, alice, "Second")
		save(t, p.repository, first)
		save(t, p.repository, aNote(t, bob, "Not hers"))
		save(t, p.repository, second)

		want := []note.ListItem{
			{ID: first.ID().Value(), Title: "First", Status: note.StatusActive},
			{ID: second.ID().Value(), Title: "Second", Status: note.StatusActive},
		}
		if got := p.notesOf(t, alice.Value()); !reflect.DeepEqual(got, want) {
			t.Errorf("got %+v, want %+v", got, want)
		}
		if got := p.notesOf(t, "nobody"); len(got) != 0 {
			t.Errorf("nobody's notes: got %+v, want none", got)
		}
	})
}

func TestQueriesListTheNotesSharedWithAnAccountWhoeverOwnsThem(t *testing.T) {
	contract(t, func(t *testing.T, p persistence) {
		shared := aNote(t, alice, "Shared", "for bob")
		mustDo(t, shared.ShareWith(alice, bob))
		kept := aNote(t, alice, "Kept")
		save(t, p.repository, shared)
		save(t, p.repository, kept)

		want := []note.SharedListItem{{ID: shared.ID().Value(), Title: "Shared", Content: "for bob", OwnerID: "alice"}}
		if got := p.sharedWith(t, bob.Value()); !reflect.DeepEqual(got, want) {
			t.Errorf("got %+v, want %+v", got, want)
		}
		if got := p.sharedWith(t, alice.Value()); len(got) != 0 {
			t.Errorf("alice's shared notes: got %+v, want none", got)
		}
	})
}

func TestQueriesListAnOwnersPinnedNotesFirstEachGroupInTheOrderTheyWereSaved(t *testing.T) {
	contract(t, func(t *testing.T, p persistence) {
		first := aNote(t, alice, "First")
		second := aNote(t, alice, "Second")
		third := aNote(t, alice, "Third")
		save(t, p.repository, first)
		save(t, p.repository, second)
		save(t, p.repository, third)
		// Pinning the last one, as a handler does, puts it first; the others keep their order.
		reread := find(t, p.repository, third.ID().Value())
		mustDo(t, reread.Pin(alice))
		save(t, p.repository, reread)

		want := []note.ListItem{
			{ID: third.ID().Value(), Title: "Third", Status: note.StatusActive, Pinned: true},
			{ID: first.ID().Value(), Title: "First", Status: note.StatusActive},
			{ID: second.ID().Value(), Title: "Second", Status: note.StatusActive},
		}
		if got := p.notesOf(t, alice.Value()); !reflect.DeepEqual(got, want) {
			t.Errorf("got %+v, want %+v", got, want)
		}

		// Unpinning it puts it back where it was saved.
		reread = find(t, p.repository, third.ID().Value())
		mustDo(t, reread.Unpin(alice))
		save(t, p.repository, reread)
		got := p.notesOf(t, alice.Value())
		if len(got) != 3 || got[2].ID != third.ID().Value() || got[2].Pinned {
			t.Errorf("got %+v, want the third note last, unpinned", got)
		}
	})
}

func TestQueriesKeepTheOrderOfFirstSaveWhenANoteIsSavedAgain(t *testing.T) {
	contract(t, func(t *testing.T, p persistence) {
		first := aNote(t, alice, "First")
		second := aNote(t, alice, "Second")
		save(t, p.repository, first)
		save(t, p.repository, second)
		reread := find(t, p.repository, first.ID().Value())
		mustDo(t, reread.Edit(alice, "First, edited", "again"))
		save(t, p.repository, reread)

		got := p.notesOf(t, alice.Value())
		if len(got) != 2 || got[0].ID != first.ID().Value() || got[0].Title != "First, edited" || got[1].ID != second.ID().Value() {
			t.Errorf("got %+v, want the first note first, edited", got)
		}
	})
}
