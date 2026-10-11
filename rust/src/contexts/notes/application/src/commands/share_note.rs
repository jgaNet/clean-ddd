//! The use case, and nothing but the use case: who is calling, load the aggregate, hand it to
//! the domain service that holds the one rule the aggregate cannot check alone (the recipient
//! exists), save, publish what was recorded. No rule of its own: everything that can be refused
//! is refused by `NoteSharing` or by `Note`, and comes back as a failed result.

use std::sync::Arc;

use architecture_application::{CommandHandler, ExecutionContext, publish_domain_events};
use architecture_domain::{CommandEvent, DomainResult, Event, Id};
use notes_domain::note::NoteSharing;
use notes_domain::note::note_exceptions::note_not_found;
use notes_domain::note::ports::account_directory::AccountDirectory;
use notes_domain::note::ports::note_repository::NoteRepository;
use shared_kernel_application::require_signed_in;

use super::super::SERVICE;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ShareNote {
    pub note_id: String,
    pub recipient_id: String,
}

impl Event for ShareNote {
    fn name(&self) -> &'static str {
        Self::NAME
    }
}

impl CommandEvent for ShareNote {
    const NAME: &'static str = "ShareNote";
}

pub struct ShareNoteCommandHandler<R, D: AccountDirectory> {
    repository: Arc<R>,
    sharing: NoteSharing<D>,
}

impl<R, D: AccountDirectory> ShareNoteCommandHandler<R, D> {
    pub fn new(repository: Arc<R>, sharing: NoteSharing<D>) -> Self {
        Self { repository, sharing }
    }
}

impl<R, D> CommandHandler for ShareNoteCommandHandler<R, D>
where
    R: NoteRepository + Send + Sync + 'static,
    D: AccountDirectory + Send + Sync + 'static,
{
    type Command = ShareNote;
    type Output = ();

    async fn execute(&self, command: ShareNote, context: &ExecutionContext) -> DomainResult {
        let actor = require_signed_in(context, SERVICE)?;

        let Some(mut note) = self.repository.find_by_id(&command.note_id).await else {
            return Err(note_not_found(&command.note_id));
        };

        self.sharing.share(&mut note, &actor, &Id::new(command.recipient_id)).await?;

        self.repository.save(&note).await?;
        publish_domain_events(note, context).await;

        Ok(())
    }
}
