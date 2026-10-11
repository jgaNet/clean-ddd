//! The repository is the write side of persistence. It speaks in aggregates: it gives you a
//! `Note` back, and it takes a `Note` in. How and where it is stored is not the domain's
//! concern; the infrastructure layer provides an implementation.
//!
//! It deliberately has no "search" method (listing and filtering belong to `NoteQueries`) and
//! no "next identity" method (the aggregate generates its own id in `Note::create`).

use std::future::Future;

use architecture_domain::DomainResult;

use super::super::Note;

pub trait NoteRepository {
    fn find_by_id(&self, id: &str) -> impl Future<Output = Option<Note>> + Send;
    /// Stores the aggregate at version + 1, or refuses it with a concurrency conflict when the
    /// stored version is no longer the one it was loaded with: of two writers who read the same
    /// version, only the first wins (ADR 8). The contract test asserts it for every adapter.
    fn save(&self, note: &Note) -> impl Future<Output = DomainResult> + Send;
}
