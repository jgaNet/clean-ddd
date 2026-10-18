//! The queries port, twice: on the in-memory store, read models built from the snapshots in the
//! order they were saved, which is the order the port promises (an owner's list puts the pinned
//! ones first, a stable sort over that order); and on SQLite, where each query is one SQL
//! statement shaped for its read model, which is the point of separating the queries from the
//! repository. The contract test says what both must answer.

use std::sync::Arc;

use architecture_infrastructure::InMemoryDataSource;
use notes_domain::note::NoteSnapshot;
use notes_domain::note::NoteStatus;
use notes_domain::note::ports::note_queries::{NoteDetail, NoteListItem, NoteQueries, SharedNoteListItem};
use rusqlite::OptionalExtension;

use crate::notes_table::{Database, lock, to_snapshot};

pub struct InMemoryNoteQueries {
    store: Arc<InMemoryDataSource<NoteSnapshot>>,
}

impl InMemoryNoteQueries {
    pub fn new(store: Arc<InMemoryDataSource<NoteSnapshot>>) -> Self {
        Self { store }
    }
}

impl NoteQueries for InMemoryNoteQueries {
    async fn find_by_id(&self, note_id: &str) -> Option<NoteDetail> {
        self.store.get(note_id).map(|note| NoteDetail {
            id: note.id,
            title: note.title,
            status: note.status,
            pinned: note.pinned,
            owner_id: note.owner_id,
            content: note.content,
            shared_with: note.shared_with,
        })
    }

    async fn find_by_owner(&self, owner_id: &str) -> Vec<NoteListItem> {
        let mut notes: Vec<NoteListItem> = self
            .store
            .all()
            .into_iter()
            .filter(|note| note.owner_id == owner_id)
            .map(|note| NoteListItem { id: note.id, title: note.title, status: note.status, pinned: note.pinned })
            .collect();
        // Pinned first; the sort is stable, so each group keeps the order the notes were saved in.
        notes.sort_by_key(|note| !note.pinned);
        notes
    }

    async fn find_shared_with(&self, account_id: &str) -> Vec<SharedNoteListItem> {
        self.store
            .all()
            .into_iter()
            .filter(|note| note.shared_with.iter().any(|id| id == account_id))
            .map(|note| SharedNoteListItem {
                id: note.id,
                title: note.title,
                content: note.content,
                owner_id: note.owner_id,
            })
            .collect()
    }
}

pub struct SqliteNoteQueries {
    database: Database,
}

impl SqliteNoteQueries {
    pub fn new(database: Database) -> Self {
        Self { database }
    }
}

impl NoteQueries for SqliteNoteQueries {
    async fn find_by_id(&self, note_id: &str) -> Option<NoteDetail> {
        lock(&self.database)
            .query_row("SELECT * FROM notes WHERE id = ?1", [note_id], to_snapshot)
            .optional()
            .expect("the notes table answers")
            .map(|note| NoteDetail {
                id: note.id,
                title: note.title,
                status: note.status,
                pinned: note.pinned,
                owner_id: note.owner_id,
                content: note.content,
                shared_with: note.shared_with,
            })
    }

    async fn find_by_owner(&self, owner_id: &str) -> Vec<NoteListItem> {
        let connection = lock(&self.database);
        let mut statement = connection
            .prepare("SELECT id, title, status, pinned FROM notes WHERE owner_id = ?1 ORDER BY pinned DESC, rowid")
            .expect("a valid statement");
        let rows = statement
            .query_map([owner_id], |row| {
                let status: String = row.get("status")?;
                Ok(NoteListItem {
                    id: row.get("id")?,
                    title: row.get("title")?,
                    status: NoteStatus::parse(&status).unwrap_or_else(|| panic!("Corrupted note row: status {status}")),
                    pinned: row.get("pinned")?,
                })
            })
            .expect("the notes table answers");
        rows.collect::<Result<Vec<_>, _>>().expect("the notes table answers")
    }

    async fn find_shared_with(&self, account_id: &str) -> Vec<SharedNoteListItem> {
        let connection = lock(&self.database);
        let mut statement = connection
            .prepare(
                "SELECT id, title, content, owner_id FROM notes
                 WHERE EXISTS (SELECT 1 FROM json_each(notes.shared_with) WHERE value = ?1)
                 ORDER BY rowid",
            )
            .expect("a valid statement");
        let rows = statement
            .query_map([account_id], |row| {
                Ok(SharedNoteListItem {
                    id: row.get("id")?,
                    title: row.get("title")?,
                    content: row.get("content")?,
                    owner_id: row.get("owner_id")?,
                })
            })
            .expect("the notes table answers");
        rows.collect::<Result<Vec<_>, _>>().expect("the notes table answers")
    }
}
