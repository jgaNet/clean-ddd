//! The shape every "change an existing note" use case follows:
//! who is calling → load the aggregate → ask it to change → save → publish what it recorded.

use std::sync::Arc;

use architecture_application::{CommandHandler, ExecutionContext, publish_domain_events};
use architecture_domain::{CommandEvent, DomainResult, Event, EventKind};
use notes_domain::note::note_exceptions::note_not_found;
use notes_domain::note::ports::note_repository::NoteRepository;
use shared_kernel_application::require_signed_in;

use super::super::SERVICE;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EditNote {
    pub note_id: String,
    pub title: String,
    pub content: String,
}

impl Event for EditNote {
    fn name(&self) -> &'static str {
        Self::NAME
    }

    fn kind(&self) -> EventKind {
        EventKind::Command
    }
}

impl CommandEvent for EditNote {
    const NAME: &'static str = "EditNote";
    type Output = ();
}

pub struct EditNoteCommandHandler<R> {
    repository: Arc<R>,
}

impl<R> EditNoteCommandHandler<R> {
    pub fn new(repository: Arc<R>) -> Self {
        Self { repository }
    }
}

impl<R: NoteRepository + Send + Sync + 'static> CommandHandler for EditNoteCommandHandler<R> {
    type Command = EditNote;

    async fn execute(&self, command: EditNote, context: &ExecutionContext) -> DomainResult {
        let actor = require_signed_in(context, SERVICE)?;

        let Some(mut note) = self.repository.find_by_id(&command.note_id).await else {
            return Err(note_not_found(&command.note_id));
        };

        note.edit(&actor, &command.title, &command.content)?;

        self.repository.save(&note).await?;
        publish_domain_events(note, context).await;

        Ok(())
    }
}
