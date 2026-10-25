//! The published contract of the Notes context: what other contexts may know about notes.
//!
//! It is deliberately not the `NoteEvent::Shared` of the Notes domain. A domain event can change
//! whenever the `Note` aggregate changes; an integration event is a promise to other contexts
//! and evolves with care. Notes translates one into the other (`NoteSharedHandler`,
//! `NoteArchivedHandler`); the receiving context reads only this.
//!
//! An archived note is no longer available to the people it was shared with: the fact carries
//! their ids, so a consumer fans out without asking Notes who they were.

use architecture_domain::{Event, EventKind, IntegrationEvent};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum NoteIntegrationEvent {
    Shared { note_id: String, title: String, owner_id: String, recipient_id: String },
    Archived { note_id: String, title: String, owner_id: String, recipient_ids: Vec<String> },
}

impl NoteIntegrationEvent {
    pub const SHARED: &'static str = "NoteSharedIntegrationEvent";
    pub const ARCHIVED: &'static str = "NoteArchivedIntegrationEvent";
}

impl Event for NoteIntegrationEvent {
    fn name(&self) -> &'static str {
        match self {
            NoteIntegrationEvent::Shared { .. } => Self::SHARED,
            NoteIntegrationEvent::Archived { .. } => Self::ARCHIVED,
        }
    }

    fn kind(&self) -> EventKind {
        EventKind::Integration
    }
}

impl IntegrationEvent for NoteIntegrationEvent {}
