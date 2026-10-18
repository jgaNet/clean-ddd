//! Restore an archived note.

use std::sync::Arc;

use architecture_application::{CommandHandler, ExecutionContext, publish_domain_events};
use architecture_domain::{CommandEvent, DomainResult, Event};
use notes_domain::note::note_exceptions::note_not_found;
use notes_domain::note::ports::note_repository::NoteRepository;
use shared_kernel_application::require_signed_in;

use super::super::SERVICE;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RestoreNote {
    pub note_id: String,
}

impl Event for RestoreNote {
    fn name(&self) -> &'static str {
        Self::NAME
    }
}

impl CommandEvent for RestoreNote {
    const NAME: &'static str = "RestoreNote";
}

pub struct RestoreNoteCommandHandler<R> {
    repository: Arc<R>,
}

impl<R> RestoreNoteCommandHandler<R> {
    pub fn new(repository: Arc<R>) -> Self {
        Self { repository }
    }
}

impl<R: NoteRepository + Send + Sync + 'static> CommandHandler for RestoreNoteCommandHandler<R> {
    type Command = RestoreNote;
    type Output = ();

    async fn execute(&self, command: RestoreNote, context: &ExecutionContext) -> DomainResult {
        let actor = require_signed_in(context, SERVICE)?;

        let Some(mut note) = self.repository.find_by_id(&command.note_id).await else {
            return Err(note_not_found(&command.note_id));
        };

        note.restore(&actor)?;

        self.repository.save(&note).await?;
        publish_domain_events(note, context).await;

        Ok(())
    }
}
