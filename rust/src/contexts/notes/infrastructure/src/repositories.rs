//! The repository port on the in-memory store: a snapshot in, a snapshot out. It knows nothing
//! of the aggregate's rules (`from_snapshot` and `to_snapshot` are the aggregate's), and offers
//! only what a use case needs to change one aggregate: find it by id, save it. Searching and
//! listing are the queries' job (`InMemoryNoteQueries`), on the same store.

use std::sync::Arc;

use architecture_domain::{DomainResult, Entity, Exception};
use architecture_infrastructure::InMemoryDataSource;
use notes_domain::note::note_exceptions::SERVICE;
use notes_domain::note::ports::note_repository::NoteRepository;
use notes_domain::note::{Note, NoteSnapshot};

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
