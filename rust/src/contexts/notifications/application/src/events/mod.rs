//! The anti-corruption layer of the Notifications context: one handler per published contract
//! it consumes. Each knows the contract and nothing else about the other context — no aggregate,
//! no exception, no port of theirs — restates the fact in Notifications words (a recipient, a
//! title, channels) and hands it to the local use case. If a contract changes, its handler is
//! the only file to touch here.

pub mod account_created_handler;
pub mod account_validated_handler;
pub mod note_archived_handler;
pub mod note_shared_handler;
pub mod operation_complete_handler;

pub use account_created_handler::AccountCreatedHandler;
pub use account_validated_handler::AccountValidatedHandler;
pub use note_archived_handler::NoteArchivedHandler;
pub use note_shared_handler::NoteSharedHandler;
pub use operation_complete_handler::OperationCompleteHandler;
