//! The reactions of the Notes context to its own facts: a log line, and the translation of a
//! domain event into the integration event other contexts subscribe to.

pub mod note_created_handler;
pub mod note_shared_handler;

pub use note_created_handler::NoteCreatedHandler;
pub use note_shared_handler::NoteSharedHandler;
