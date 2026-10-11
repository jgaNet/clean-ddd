//! The ports of the Note aggregate: what the domain needs from outside, in its own words. The
//! infrastructure implements them; the domain never knows how. No barrel re-exports them: an
//! import names the file (`ports::note_repository::NoteRepository`).

pub mod account_directory;
pub mod note_queries;
pub mod note_repository;
