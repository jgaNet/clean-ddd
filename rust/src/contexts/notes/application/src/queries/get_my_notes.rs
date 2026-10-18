//! The caller's own notes, in the order they were saved.

use std::sync::Arc;

use architecture_application::{ExecutionContext, QueryHandler};
use architecture_domain::DomainResult;
use notes_domain::note::ports::note_queries::{NoteListItem, NoteQueries};
use shared_kernel_application::require_signed_in;

use super::super::SERVICE;

pub struct GetMyNotesQueryHandler<Q> {
    queries: Arc<Q>,
}

impl<Q> GetMyNotesQueryHandler<Q> {
    pub fn new(queries: Arc<Q>) -> Self {
        Self { queries }
    }
}

impl<Q: NoteQueries + Send + Sync + 'static> QueryHandler for GetMyNotesQueryHandler<Q> {
    type Params = ();
    type Output = Vec<NoteListItem>;

    async fn execute(&self, _: (), context: &ExecutionContext) -> DomainResult<Vec<NoteListItem>> {
        let owner = require_signed_in(context, SERVICE)?;
        Ok(self.queries.find_by_owner(owner.value()).await)
    }
}
