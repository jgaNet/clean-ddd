//! The notes shared with the caller, whoever owns them, in the order they were saved.

use std::sync::Arc;

use architecture_application::{ExecutionContext, Query, QueryHandler};
use architecture_domain::DomainResult;
use notes_domain::note::ports::note_queries::{NoteQueries, SharedNoteListItem};
use shared_kernel_application::require_signed_in;

use super::super::SERVICE;

/// The question; it needs no parameter but the caller.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct GetNotesSharedWithMe;

impl Query for GetNotesSharedWithMe {
    type Output = Vec<SharedNoteListItem>;
}

pub struct GetNotesSharedWithMeQueryHandler<Q> {
    queries: Arc<Q>,
}

impl<Q> GetNotesSharedWithMeQueryHandler<Q> {
    pub fn new(queries: Arc<Q>) -> Self {
        Self { queries }
    }
}

impl<Q: NoteQueries + Send + Sync + 'static> QueryHandler for GetNotesSharedWithMeQueryHandler<Q> {
    type Query = GetNotesSharedWithMe;

    async fn execute(
        &self,
        _: GetNotesSharedWithMe,
        context: &ExecutionContext,
    ) -> DomainResult<Vec<SharedNoteListItem>> {
        let reader = require_signed_in(context, SERVICE)?;
        Ok(self.queries.find_shared_with(reader.value()).await)
    }
}
