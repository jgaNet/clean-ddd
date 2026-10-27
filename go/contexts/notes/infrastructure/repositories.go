package infrastructure

import (
	"database/sql"
	"errors"

	"clean-ddd/architecture/domain"
	"clean-ddd/architecture/infrastructure"
	"clean-ddd/contexts/notes/domain/note"
)

// The repository port, twice: on the in-memory store (a snapshot in, a snapshot out) and on
// SQLite, behind the same interface. The in-memory one knows nothing of the aggregate's rules
// (FromSnapshot and ToSnapshot are the aggregate's), and offers only what a use case needs to
// change one aggregate: find it by id, save it. Searching and listing are the queries' job
// (queries.go), on the same store.
//
// Save is where optimistic concurrency is enforced (ADR 8, CONC-OPTIMISTIC): the stored version
// must still be the one the aggregate was read at, and the store gets version + 1.

func staleNote(noteID string, read, stored int) *domain.Exception {
	return domain.ConcurrencyConflict(note.Service, "The note changed since it was read",
		map[string]any{"noteId": noteID, "read": read, "stored": stored})
}

type InMemoryNoteRepository struct {
	store *infrastructure.InMemoryDataSource[note.Snapshot]
}

func NewInMemoryNoteRepository(store *infrastructure.InMemoryDataSource[note.Snapshot]) *InMemoryNoteRepository {
	return &InMemoryNoteRepository{store: store}
}

func (r *InMemoryNoteRepository) FindByID(id string) (*note.Note, error) {
	snapshot, ok := r.store.Get(id)
	if !ok {
		return nil, nil
	}
	return note.FromSnapshot(snapshot), nil
}

func (r *InMemoryNoteRepository) Save(n *note.Note) error {
	id := n.ID().Value()
	return r.store.Modify(id, func(stored note.Snapshot, exists bool) (note.Snapshot, error) {
		if exists && stored.Version != n.Version() {
			return stored, staleNote(id, n.Version(), stored.Version)
		}
		snapshot := n.ToSnapshot()
		snapshot.Version = n.Version() + 1
		return snapshot, nil
	})
}

// SqliteNoteRepository is the same port as InMemoryNoteRepository, over a real database. It
// exists to prove the claim the ports make: the domain and the use cases did not change by one
// line to get here, and persistence_contract_test.go holds both adapters to the same
// expectations. The local wiring keeps the in-memory one.
type SqliteNoteRepository struct {
	db *sql.DB
}

func NewSqliteNoteRepository(db *sql.DB) (*SqliteNoteRepository, error) {
	if err := CreateNotesTable(db); err != nil {
		return nil, err
	}
	return &SqliteNoteRepository{db: db}, nil
}

func (r *SqliteNoteRepository) FindByID(id string) (*note.Note, error) {
	snapshot, err := scanNote(r.db.QueryRow("SELECT "+noteColumns+" FROM notes WHERE id = ?", id))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return note.FromSnapshot(snapshot), nil
}

// Save does the optimistic check the way SQL makes it atomic: update only the row still at
// the version the aggregate was read at; no row changed means someone else wrote first (ADR 8).
func (r *SqliteNoteRepository) Save(n *note.Note) error {
	row := toRow(n.ToSnapshot())
	tx, err := r.db.Begin()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	updated, err := tx.Exec(
		`UPDATE notes SET title = ?, content = ?, status = ?, shared_with = ?, version = ? + 1
		 WHERE id = ? AND version = ?`,
		row.title, row.content, row.status, row.sharedWith, row.version, row.id, row.version)
	if err != nil {
		return err
	}
	if changed, _ := updated.RowsAffected(); changed > 0 {
		return tx.Commit()
	}
	var stored int
	switch err := tx.QueryRow("SELECT version FROM notes WHERE id = ?", row.id).Scan(&stored); {
	case err == nil:
		return staleNote(row.id, n.Version(), stored)
	case !errors.Is(err, sql.ErrNoRows):
		return err
	}
	if _, err := tx.Exec(
		`INSERT INTO notes (id, owner_id, title, content, status, shared_with, version) VALUES (?, ?, ?, ?, ?, ?, ? + 1)`,
		row.id, row.ownerID, row.title, row.content, row.status, row.sharedWith, row.version); err != nil {
		return err
	}
	return tx.Commit()
}
