//! One note, in detail, for someone who may see it: its owner, or an account it was shared with.

use std::sync::Arc;

use architecture_application::{ExecutionContext, QueryHandler};
use architecture_domain::DomainResult;
use notes_domain::note::note_exceptions::note_not_found;
use notes_domain::note::ports::note_queries::{NoteDetail, NoteQueries};
use shared_kernel_application::require_signed_in;

use super::super::SERVICE;

pub struct GetNoteQueryHandler<Q> {
    queries: Arc<Q>,
}

impl<Q> GetNoteQueryHandler<Q> {
    pub fn new(queries: Arc<Q>) -> Self {
        Self { queries }
    }
}

impl<Q: NoteQueries + Send + Sync + 'static> QueryHandler for GetNoteQueryHandler<Q> {
    type Params = String;
    type Output = NoteDetail;

    async fn execute(&self, note_id: String, context: &ExecutionContext) -> DomainResult<NoteDetail> {
        let reader = require_signed_in(context, SERVICE)?;

        // A note someone else owns and did not share with you does not exist, as far as you know.
        let visible =
            self.queries.find_by_id(&note_id).await.filter(|note| {
                note.owner_id == reader.value() || note.shared_with.iter().any(|id| id == reader.value())
            });

        visible.ok_or_else(|| note_not_found(&note_id))
    }
}
