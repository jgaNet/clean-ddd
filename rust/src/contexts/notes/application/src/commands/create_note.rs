//! Create a note: the caller becomes its owner, the aggregate picks its identity.

use std::sync::Arc;

use architecture_application::{CommandHandler, ExecutionContext, publish_domain_events};
use architecture_domain::{CommandEvent, DomainResult, Entity, Event, EventKind};
use notes_domain::note::ports::note_repository::NoteRepository;
use notes_domain::note::{NewNote, Note};
use shared_kernel_application::require_signed_in;

use super::super::SERVICE;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CreateNote {
    pub title: String,
    pub content: String,
}

impl Event for CreateNote {
    fn name(&self) -> &'static str {
        Self::NAME
    }

    fn kind(&self) -> EventKind {
        EventKind::Command
    }
}

impl CommandEvent for CreateNote {
    const NAME: &'static str = "CreateNote";
    type Output = String;
}

pub struct CreateNoteCommandHandler<R> {
    repository: Arc<R>,
}

impl<R> CreateNoteCommandHandler<R> {
    pub fn new(repository: Arc<R>) -> Self {
        Self { repository }
    }
}

impl<R: NoteRepository + Send + Sync + 'static> CommandHandler for CreateNoteCommandHandler<R> {
    type Command = CreateNote;

    async fn execute(&self, command: CreateNote, context: &ExecutionContext) -> DomainResult<String> {
        let owner = require_signed_in(context, SERVICE)?;

        let note = Note::create(NewNote {
            owner_id: owner.value().to_string(),
            title: command.title,
            content: command.content,
        })?;
        let note_id = note.id().value().to_string();

        self.repository.save(&note).await?;
        publish_domain_events(note, context).await;

        Ok(note_id)
    }
}
