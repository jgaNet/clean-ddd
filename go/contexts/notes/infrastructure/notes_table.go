package infrastructure

import (
	"database/sql"
	"encoding/json"
	"fmt"

	_ "modernc.org/sqlite" // the driver, registered as "sqlite"

	"clean-ddd/contexts/notes/domain/note"
)

// The one table behind the SQLite adapters, and the two conversions between a row and the
// snapshot the aggregate is rebuilt from. The repository and the queries share it, the way
// their in-memory counterparts share one InMemoryDataSource: same store, two ports.
//
// shared_with is a JSON array; SQLite's json_each() lets the queries filter on it without a
// second table, which is all this reference needs. A real schema would normalise it.
//
// CREATE TABLE IF NOT EXISTS is enough because the store is created per process (an in-memory
// database in tests). A file database that outlives the code would need a migration for every
// new column; this reference has no migration mechanism, on purpose.

// InMemoryDatabase opens an in-memory database with the notes table: what a test, or a wiring,
// starts from. One connection, since an in-memory SQLite database lives in its connection.
func InMemoryDatabase() (*sql.DB, error) {
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	if err := CreateNotesTable(db); err != nil {
		return nil, err
	}
	return db, nil
}

func CreateNotesTable(db *sql.DB) error {
	_, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS notes (
		  id          TEXT PRIMARY KEY,
		  owner_id    TEXT NOT NULL,
		  title       TEXT NOT NULL,
		  content     TEXT NOT NULL,
		  status      TEXT NOT NULL,
		  pinned      INTEGER NOT NULL,
		  shared_with TEXT NOT NULL,
		  version     INTEGER NOT NULL
		)`)
	return err
}

const noteColumns = "id, owner_id, title, content, status, pinned, shared_with, version"

type noteRow struct {
	id, ownerID, title, content, status, sharedWith string
	pinned                                          bool
	version                                         int
}

func toRow(n note.Snapshot) noteRow {
	shared, _ := json.Marshal(n.SharedWith)
	if n.SharedWith == nil {
		shared = []byte("[]")
	}
	return noteRow{id: n.ID, ownerID: n.OwnerID, title: n.Title, content: n.Content, status: string(n.Status), pinned: n.Pinned, sharedWith: string(shared), version: n.Version}
}

// scanNote reads a full row of the table, as the aggregate is rebuilt from it.
func scanNote(row *sql.Row) (note.Snapshot, error) {
	var r noteRow
	if err := row.Scan(&r.id, &r.ownerID, &r.title, &r.content, &r.status, &r.pinned, &r.sharedWith, &r.version); err != nil {
		return note.Snapshot{}, err
	}
	status, known := note.ParseStatus(r.status)
	if !known {
		return note.Snapshot{}, fmt.Errorf("corrupted note %s: unknown status %q", r.id, r.status)
	}
	var shared []string
	if err := json.Unmarshal([]byte(r.sharedWith), &shared); err != nil {
		return note.Snapshot{}, fmt.Errorf("corrupted note %s: %w", r.id, err)
	}
	if shared == nil {
		shared = []string{}
	}
	return note.Snapshot{ID: r.id, OwnerID: r.ownerID, Title: r.title, Content: r.content, Status: status, Pinned: r.pinned, SharedWith: shared, Version: r.version}, nil
}
