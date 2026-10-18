//! The repository port, twice: on the in-memory store, and on SQLite. A snapshot in, a snapshot
//! out; neither knows the aggregate's rules (`from_snapshot` and `to_snapshot` are the
//! aggregate's), and each offers only what a use case needs to change one aggregate: find it by
//! id, save it. Searching and listing are the queries' job, on the same store.
//!
//! The SQLite one exists to prove the claim the ports make: the domain and the use cases did not
//! change by one line to get here, and the contract test holds both adapters to the same
//! expectations. The local wiring keeps the in-memory one; hand the wiring a `Database` instead
//! of a store to persist to a file.

use std::sync::Arc;

use architecture_domain::{DomainResult, Entity, Exception};
use architecture_infrastructure::InMemoryDataSource;
use notes_domain::note::note_exceptions::SERVICE;
use notes_domain::note::ports::note_repository::NoteRepository;
use notes_domain::note::{Note, NoteSnapshot};
use rusqlite::{OptionalExtension, params};

use crate::notes_table::{Database, lock, shared_with_column, to_snapshot};

pub struct InMemoryNoteRepository {
    store: Arc<InMemoryDataSource<NoteSnapshot>>,
}

impl InMemoryNoteRepository {
    pub fn new(store: Arc<InMemoryDataSource<NoteSnapshot>>) -> Self {
        Self { store }
    }
}

impl NoteRepository for InMemoryNoteRepository {
    async fn find_by_id(&self, id: &str) -> Option<Note> {
        self.store.get(id).map(Note::from_snapshot)
    }

    async fn save(&self, note: &Note) -> DomainResult {
        let id = note.id().value();
        if let Some(stored) = self.store.get(id)
            && stored.version != note.version()
        {
            return Err(stale_note(id, note.version(), stored.version));
        }
        let mut snapshot = note.to_snapshot();
        snapshot.version = note.version() + 1;
        self.store.set(id, snapshot);
        Ok(())
    }
}

/// The aggregate changed since it was read: the caller re-reads and decides again (ADR 8).
pub fn stale_note(note_id: &str, read: u64, stored: u64) -> Exception {
    Exception::concurrency_conflict(SERVICE, "The note changed since it was read")
        .with("noteId", note_id)
        .with("read", read)
        .with("stored", stored)
}

pub struct SqliteNoteRepository {
    database: Database,
}

impl SqliteNoteRepository {
    pub fn new(database: Database) -> Self {
        Self { database }
    }
}

impl NoteRepository for SqliteNoteRepository {
    async fn find_by_id(&self, id: &str) -> Option<Note> {
        lock(&self.database)
            .query_row("SELECT * FROM notes WHERE id = ?1", [id], to_snapshot)
            .optional()
            .expect("the notes table answers")
            .map(Note::from_snapshot)
    }

    /// The optimistic check the way SQL makes it atomic: update only the row still at the
    /// version the aggregate was read at; no row changed means someone else wrote first (ADR 8).
    async fn save(&self, note: &Note) -> DomainResult {
        let snapshot = note.to_snapshot();
        let shared_with = shared_with_column(&snapshot.shared_with);
        let connection = lock(&self.database);
        // An update never moves a note to another owner.
        let updated = connection
            .execute(
                "UPDATE notes SET title = ?1, content = ?2, status = ?3, pinned = ?4, shared_with = ?5, version = ?6 + 1
                 WHERE id = ?7 AND version = ?6",
                params![
                    snapshot.title,
                    snapshot.content,
                    snapshot.status.as_str(),
                    snapshot.pinned,
                    shared_with,
                    snapshot.version,
                    snapshot.id
                ],
            )
            .expect("the notes table answers");
        if updated > 0 {
            return Ok(());
        }

        let stored: Option<i64> = connection
            .query_row("SELECT version FROM notes WHERE id = ?1", [&snapshot.id], |row| row.get(0))
            .optional()
            .expect("the notes table answers");
        if let Some(stored) = stored {
            return Err(stale_note(&snapshot.id, snapshot.version, u64::try_from(stored).unwrap_or_default()));
        }

        connection
            .execute(
                "INSERT INTO notes (id, owner_id, title, content, status, pinned, shared_with, version)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8 + 1)",
                params![
                    snapshot.id,
                    snapshot.owner_id,
                    snapshot.title,
                    snapshot.content,
                    snapshot.status.as_str(),
                    snapshot.pinned,
                    shared_with,
                    snapshot.version
                ],
            )
            .expect("the notes table answers");
        Ok(())
    }
}
