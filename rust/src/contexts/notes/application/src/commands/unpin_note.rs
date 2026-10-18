//! Unpin a pinned note: it goes back among the others, in the order it was saved.

use std::sync::Arc;

use architecture_application::{CommandHandler, ExecutionContext, publish_domain_events};
use architecture_domain::{CommandEvent, DomainResult, Event, EventKind};
use notes_domain::note::note_exceptions::note_not_found;
use notes_domain::note::ports::note_repository::NoteRepository;
use shared_kernel_application::require_signed_in;

use super::super::SERVICE;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UnpinNote {
    pub note_id: String,
}

impl Event for UnpinNote {
    fn name(&self) -> &'static str {
        Self::NAME
    }

    fn kind(&self) -> EventKind {
        EventKind::Command
    }
}

impl CommandEvent for UnpinNote {
    const NAME: &'static str = "UnpinNote";
    type Output = ();
}

pub struct UnpinNoteCommandHandler<R> {
    repository: Arc<R>,
}

impl<R> UnpinNoteCommandHandler<R> {
    pub fn new(repository: Arc<R>) -> Self {
        Self { repository }
    }
}

impl<R: NoteRepository + Send + Sync + 'static> CommandHandler for UnpinNoteCommandHandler<R> {
    type Command = UnpinNote;

    async fn execute(&self, command: UnpinNote, context: &ExecutionContext) -> DomainResult {
        let actor = require_signed_in(context, SERVICE)?;

        let Some(mut note) = self.repository.find_by_id(&command.note_id).await else {
            return Err(note_not_found(&command.note_id));
        };

        note.unpin(&actor)?;

        self.repository.save(&note).await?;
        publish_domain_events(note, context).await;

        Ok(())
    }
}
