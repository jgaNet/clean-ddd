package infrastructure

import (
	"database/sql"
	"errors"
	"slices"

	"clean-ddd/architecture/infrastructure"
	"clean-ddd/contexts/notes/domain/note"
)

// The read side, twice: over the in-memory store, where each method shapes a read model from
// the snapshots, and over SQLite, where each query is one SQL statement shaped for its read
// model; that is the point of separating queries from the repository (ADR 5,
// QUERY-READ-MODELS). The store keeps insertion order and the table its rowid, which is the
// order the port promises; an owner's list puts the pinned notes first (a stable sort in
// memory, an ORDER BY in SQL), and persistence_contract_test.go holds every adapter to it.

type InMemoryNoteQueries struct {
	store *infrastructure.InMemoryDataSource[note.Snapshot]
}

func NewInMemoryNoteQueries(store *infrastructure.InMemoryDataSource[note.Snapshot]) *InMemoryNoteQueries {
	return &InMemoryNoteQueries{store: store}
}

func (q *InMemoryNoteQueries) FindByID(noteID string) (*note.Detail, error) {
	n, ok := q.store.Get(noteID)
	if !ok {
		return nil, nil
	}
	return &note.Detail{ID: n.ID, Title: n.Title, Status: n.Status, Pinned: n.Pinned, OwnerID: n.OwnerID, Content: n.Content, SharedWith: slices.Clone(n.SharedWith)}, nil
}

func (q *InMemoryNoteQueries) FindByOwner(ownerID string) ([]note.ListItem, error) {
	items := []note.ListItem{}
	for _, n := range q.store.All() {
		if n.OwnerID == ownerID {
			items = append(items, note.ListItem{ID: n.ID, Title: n.Title, Status: n.Status, Pinned: n.Pinned})
		}
	}
	// Pinned first; the sort is stable, so each group keeps the order of the store.
	slices.SortStableFunc(items, func(a, b note.ListItem) int {
		switch {
		case a.Pinned == b.Pinned:
			return 0
		case a.Pinned:
			return -1
		default:
			return 1
		}
	})
	return items, nil
}

func (q *InMemoryNoteQueries) FindSharedWith(accountID string) ([]note.SharedListItem, error) {
	items := []note.SharedListItem{}
	for _, n := range q.store.All() {
		if slices.Contains(n.SharedWith, accountID) {
			items = append(items, note.SharedListItem{ID: n.ID, Title: n.Title, Content: n.Content, OwnerID: n.OwnerID})
		}
	}
	return items, nil
}

type SqliteNoteQueries struct {
	db *sql.DB
}

func NewSqliteNoteQueries(db *sql.DB) (*SqliteNoteQueries, error) {
	if err := CreateNotesTable(db); err != nil {
		return nil, err
	}
	return &SqliteNoteQueries{db: db}, nil
}

func (q *SqliteNoteQueries) FindByID(noteID string) (*note.Detail, error) {
	n, err := scanNote(q.db.QueryRow("SELECT "+noteColumns+" FROM notes WHERE id = ?", noteID))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &note.Detail{ID: n.ID, Title: n.Title, Status: n.Status, Pinned: n.Pinned, OwnerID: n.OwnerID, Content: n.Content, SharedWith: n.SharedWith}, nil
}

func (q *SqliteNoteQueries) FindByOwner(ownerID string) ([]note.ListItem, error) {
	rows, err := q.db.Query("SELECT id, title, status, pinned FROM notes WHERE owner_id = ? ORDER BY pinned DESC, rowid", ownerID)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	items := []note.ListItem{}
	for rows.Next() {
		var item note.ListItem
		var status string
		if err := rows.Scan(&item.ID, &item.Title, &status, &item.Pinned); err != nil {
			return nil, err
		}
		item.Status = note.Status(status)
		items = append(items, item)
	}
	return items, rows.Err()
}

func (q *SqliteNoteQueries) FindSharedWith(accountID string) ([]note.SharedListItem, error) {
	rows, err := q.db.Query(
		`SELECT id, title, content, owner_id FROM notes
		 WHERE EXISTS (SELECT 1 FROM json_each(notes.shared_with) WHERE value = ?)
		 ORDER BY rowid`, accountID)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	items := []note.SharedListItem{}
	for rows.Next() {
		var item note.SharedListItem
		if err := rows.Scan(&item.ID, &item.Title, &item.Content, &item.OwnerID); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}
