//! The wiring of the Notes context: the one place its handlers are bound to its adapters and
//! listed in a `Module`. Plain data: construct the handler, pass its ports, list it
//! (ARCH-MODULES-DATA). Anything else the context exposes is a public item of this crate.
//!
//! Sharing needs to know whether an account exists: Notes asks through its own port, which the
//! composition root answers with an adapter over Security's read model. Notes never imports
//! Security; the directory comes in as a parameter, which is where the two contexts meet.

use std::sync::Arc;

use architecture_application::{Module, ModuleDefinition, Subscription, query};
use architecture_infrastructure::InMemoryDataSource;
use notes_application::commands::archive_note::ArchiveNoteCommandHandler;
use notes_application::commands::create_note::CreateNoteCommandHandler;
use notes_application::commands::edit_note::EditNoteCommandHandler;
use notes_application::commands::restore_note::RestoreNoteCommandHandler;
use notes_application::commands::share_note::ShareNoteCommandHandler;
use notes_application::commands::suggest_note_title::SuggestNoteTitleCommandHandler;
use notes_application::events::{NoteArchivedHandler, NoteCreatedHandler, NoteSharedHandler};
use notes_application::queries::get_my_notes::GetMyNotesQueryHandler;
use notes_application::queries::get_note::GetNoteQueryHandler;
use notes_application::queries::get_notes_shared_with_me::GetNotesSharedWithMeQueryHandler;
use notes_domain::note::ports::account_directory::AccountDirectory;
use notes_domain::note::{NoteSharing, NoteSnapshot};
use notes_infrastructure::queries::InMemoryNoteQueries;
use notes_infrastructure::repositories::InMemoryNoteRepository;
use notes_infrastructure::suggestions::FirstLineTitleSuggestions;

/// The context's store, which the composition root hands to the unit of work.
pub type NoteStore = Arc<InMemoryDataSource<NoteSnapshot>>;

pub fn note_store() -> NoteStore {
    Arc::new(InMemoryDataSource::new())
}

/// The Notes module for the local environment: write side and read side share the same store
/// here; a real deployment may split them.
pub fn local_notes_module<D: AccountDirectory + Send + Sync + 'static>(store: &NoteStore, accounts: D) -> Module {
    let repository = Arc::new(InMemoryNoteRepository::new(store.clone()));
    let queries = Arc::new(InMemoryNoteQueries::new(store.clone()));

    Module::new(ModuleDefinition {
        name: "Notes",
        commands: vec![
            Subscription::command(CreateNoteCommandHandler::new(repository.clone())),
            Subscription::command(EditNoteCommandHandler::new(repository.clone())),
            Subscription::command(ArchiveNoteCommandHandler::new(repository.clone())),
            Subscription::command(RestoreNoteCommandHandler::new(repository.clone())),
            Subscription::command(ShareNoteCommandHandler::new(repository.clone(), NoteSharing::new(accounts))),
            // The one non-deterministic source of the context, behind a port (ADR 7); a model would go here.
            Subscription::command(SuggestNoteTitleCommandHandler::new(repository, FirstLineTitleSuggestions)),
        ],
        queries: vec![
            query(GetMyNotesQueryHandler::new(queries.clone())),
            query(GetNoteQueryHandler::new(queries.clone())),
            query(GetNotesSharedWithMeQueryHandler::new(queries)),
        ],
        domain_events: vec![
            Subscription::reaction("NoteCreated", NoteCreatedHandler),
            Subscription::reaction("NoteShared", NoteSharedHandler),
            Subscription::reaction("NoteArchived", NoteArchivedHandler),
        ],
        integration_events: vec![],
    })
}
