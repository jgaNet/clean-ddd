//! Snapshot of a `Note`: the plain data the aggregate is persisted as and rebuilt from.
//!
//! The aggregate (`mod.rs`) owns the behaviour and the rules; these types own nothing. The
//! snapshot is the only shape that crosses the domain boundary towards the infrastructure.

use super::note_status::NoteStatus;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NoteSnapshot {
    pub id: String,
    pub owner_id: String,
    pub title: String,
    pub content: String,
    pub status: NoteStatus,
    pub shared_with: Vec<String>,
    /// The version this snapshot was read at; the repository stores version + 1 (ADR 8).
    pub version: u64,
}

/// What is needed to write a brand new note.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NewNote {
    pub owner_id: String,
    pub title: String,
    pub content: String,
}
