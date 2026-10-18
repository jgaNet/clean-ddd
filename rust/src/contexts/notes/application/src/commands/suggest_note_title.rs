//! The canonical example of ADR 7: a decision the domain cannot make from its own state enters
//! it as a value. The handler asks the port (the only non-deterministic step), then hands the
//! suggestion to the aggregate exactly as it would hand it a title typed by the owner: `edit()`
//! applies `NoteTitle`'s rules and the owner-and-active rules, and refuses a blank or too long
//! suggestion like any other. The source proposes; the domain disposes.
//!
//! The suggestion, with its provenance, is the operation's result: the Tracker keeps it, so an
//! accepted title can be traced to the source and the version that proposed it.

use std::sync::Arc;

use architecture_application::{CommandHandler, ExecutionContext, publish_domain_events};
use architecture_domain::{CommandEvent, DomainResult, Event, EventKind};
use notes_domain::note::note_exceptions::note_not_found;
use notes_domain::note::ports::note_repository::NoteRepository;
use shared_kernel_application::require_signed_in;

use super::super::SERVICE;
use super::super::suggestions::{NoteTitleSuggestions, TitleSuggestion};

/// Asks for a title for the note, from its content, and applies it if the note accepts it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SuggestNoteTitle {
    pub note_id: String,
}

impl Event for SuggestNoteTitle {
    fn name(&self) -> &'static str {
        Self::NAME
    }

    fn kind(&self) -> EventKind {
        EventKind::Command
    }
}

impl CommandEvent for SuggestNoteTitle {
    const NAME: &'static str = "SuggestNoteTitle";
    type Output = TitleSuggestion;
}

pub struct SuggestNoteTitleCommandHandler<R, S> {
    repository: Arc<R>,
    suggestions: S,
}

impl<R, S> SuggestNoteTitleCommandHandler<R, S> {
    pub fn new(repository: Arc<R>, suggestions: S) -> Self {
        Self { repository, suggestions }
    }
}

impl<R, S> CommandHandler for SuggestNoteTitleCommandHandler<R, S>
where
    R: NoteRepository + Send + Sync + 'static,
    S: NoteTitleSuggestions + Send + Sync + 'static,
{
    type Command = SuggestNoteTitle;

    async fn execute(&self, command: SuggestNoteTitle, context: &ExecutionContext) -> DomainResult<TitleSuggestion> {
        let actor = require_signed_in(context, SERVICE)?;

        let Some(mut note) = self.repository.find_by_id(&command.note_id).await else {
            return Err(note_not_found(&command.note_id));
        };

        let suggestion = self.suggestions.suggest(note.content()).await;

        let content = note.content().to_string();
        note.edit(&actor, &suggestion.title, &content)?;

        self.repository.save(&note).await?;
        publish_domain_events(note, context).await;

        Ok(suggestion)
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use architecture_application::{Auth, ExecutionContextOptions};
    use architecture_infrastructure::{InMemoryDataSource, InMemoryEventBus};
    use notes_domain::note::NoteTitle;
    use notes_domain::note::note_exceptions::{NOT_NOTE_OWNER, NOTE_TITLE_TOO_LONG};
    use notes_infrastructure::repositories::InMemoryNoteRepository;

    use super::super::super::suggestions::SuggestionProvenance;
    use super::super::create_note::{CreateNote, CreateNoteCommandHandler};
    use super::*;

    /// The non-deterministic source, made deterministic for the test: it proposes what the test says.
    struct Proposing {
        title: String,
        asked: Mutex<u32>,
    }
    impl Proposing {
        fn new(title: &str) -> Self {
            Self { title: title.into(), asked: Mutex::new(0) }
        }
    }
    impl NoteTitleSuggestions for Proposing {
        async fn suggest(&self, _content: &str) -> TitleSuggestion {
            *self.asked.lock().unwrap() += 1;
            TitleSuggestion {
                title: self.title.clone(),
                provenance: SuggestionProvenance {
                    source: "test".into(),
                    version: "1".into(),
                    at: chrono::DateTime::UNIX_EPOCH,
                },
            }
        }
    }

    fn context_for(subject_id: &str) -> ExecutionContext {
        ExecutionContext::new(ExecutionContextOptions {
            trace_id: "trace".into(),
            auth: Auth::of(subject_id, "USER"),
            event_bus: Arc::new(InMemoryEventBus::new()),
            unit_of_work: None,
            logger: None,
        })
    }

    fn a_note_of(repository: &Arc<InMemoryNoteRepository>, owner_id: &str) -> String {
        pollster::block_on(CreateNoteCommandHandler::new(repository.clone()).execute(
            CreateNote { title: "Untitled".into(), content: "Milk, eggs, bread".into() },
            &context_for(owner_id),
        ))
        .expect("created")
    }

    #[test]
    fn applies_a_suggestion_the_note_accepts_and_answers_it_with_its_provenance() {
        let store = Arc::new(InMemoryDataSource::new());
        let repository = Arc::new(InMemoryNoteRepository::new(store.clone()));
        let note_id = a_note_of(&repository, "alice");

        let suggestion = pollster::block_on(
            SuggestNoteTitleCommandHandler::new(repository.clone(), Proposing::new("Groceries"))
                .execute(SuggestNoteTitle { note_id: note_id.clone() }, &context_for("alice")),
        )
        .expect("applied");

        assert_eq!(suggestion.title, "Groceries");
        assert_eq!(suggestion.provenance.source, "test");
        assert_eq!(store.get(&note_id).expect("stored").title, "Groceries");
    }

    #[test]
    fn lets_the_note_refuse_a_suggestion_that_breaks_its_rules_and_changes_nothing() {
        let store = Arc::new(InMemoryDataSource::new());
        let repository = Arc::new(InMemoryNoteRepository::new(store.clone()));
        let note_id = a_note_of(&repository, "alice");
        let too_long = "x".repeat(NoteTitle::MAX_LENGTH + 1);

        let result = pollster::block_on(
            SuggestNoteTitleCommandHandler::new(repository.clone(), Proposing::new(&too_long))
                .execute(SuggestNoteTitle { note_id: note_id.clone() }, &context_for("alice")),
        );

        assert!(result.expect_err("too long").is(NOTE_TITLE_TOO_LONG));
        assert_eq!(store.get(&note_id).expect("stored").title, "Untitled");
    }

    #[test]
    fn is_the_owners_to_ask_anyone_else_is_refused() {
        let store = Arc::new(InMemoryDataSource::new());
        let repository = Arc::new(InMemoryNoteRepository::new(store.clone()));
        let note_id = a_note_of(&repository, "alice");
        let handler = SuggestNoteTitleCommandHandler::new(repository.clone(), Proposing::new("Groceries"));

        let result =
            pollster::block_on(handler.execute(SuggestNoteTitle { note_id: note_id.clone() }, &context_for("bob")));

        assert!(result.expect_err("not the owner").is(NOT_NOTE_OWNER));
        assert_eq!(store.get(&note_id).expect("stored").title, "Untitled");
    }
}
