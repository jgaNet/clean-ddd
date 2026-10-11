//! Read models: the shapes a screen or an API wants to display. They are plain data, tailored
//! to a use case, and they never come back into the domain.
//!
//! The queries port is the read side (the "Q" of CQRS). It returns read models, not
//! aggregates, so the read side is free to be shaped, indexed and cached however the screens
//! need, without dragging the business rules along (ADR 5).

use std::future::Future;

use super::super::note_status::NoteStatus;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NoteListItem {
    pub id: String,
    pub title: String,
    pub status: NoteStatus,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NoteDetail {
    pub id: String,
    pub title: String,
    pub status: NoteStatus,
    pub owner_id: String,
    pub content: String,
    pub shared_with: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SharedNoteListItem {
    pub id: String,
    pub title: String,
    pub content: String,
    pub owner_id: String,
}

pub trait NoteQueries {
    fn find_by_id(&self, note_id: &str) -> impl Future<Output = Option<NoteDetail>> + Send;
    /// In the order they were saved. Ordering is part of this contract: the contract test asserts it for every adapter.
    fn find_by_owner(&self, owner_id: &str) -> impl Future<Output = Vec<NoteListItem>> + Send;
    /// In the order they were saved.
    fn find_shared_with(&self, account_id: &str) -> impl Future<Output = Vec<SharedNoteListItem>> + Send;
}
