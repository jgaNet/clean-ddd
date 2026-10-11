//! The queries port on the in-memory store: read models built from the snapshots, in the order
//! they were saved, which is the order the port promises.

use std::sync::Arc;

use architecture_infrastructure::InMemoryDataSource;
use notes_domain::note::NoteSnapshot;
use notes_domain::note::ports::note_queries::{NoteDetail, NoteListItem, NoteQueries, SharedNoteListItem};

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
            owner_id: note.owner_id,
            content: note.content,
            shared_with: note.shared_with,
        })
    }

    async fn find_by_owner(&self, owner_id: &str) -> Vec<NoteListItem> {
        self.store
            .all()
            .into_iter()
            .filter(|note| note.owner_id == owner_id)
            .map(|note| NoteListItem { id: note.id, title: note.title, status: note.status })
            .collect()
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
