//! The published contract of the Notes context: what other contexts may know about notes.
//!
//! It is deliberately not the `NoteEvent::Shared` of the Notes domain. A domain event can change
//! whenever the `Note` aggregate changes; an integration event is a promise to other contexts
//! and evolves with care. Notes translates one into the other (`NoteSharedHandler`); the
//! receiving context reads only this.

use architecture_domain::{Event, EventKind, IntegrationEvent};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum NoteIntegrationEvent {
    Shared { note_id: String, title: String, owner_id: String, recipient_id: String },
}

impl NoteIntegrationEvent {
    pub const SHARED: &'static str = "NoteSharedIntegrationEvent";
}

impl Event for NoteIntegrationEvent {
    fn name(&self) -> &'static str {
        match self {
            NoteIntegrationEvent::Shared { .. } => Self::SHARED,
        }
    }

    fn kind(&self) -> EventKind {
        EventKind::Integration
    }
}

impl IntegrationEvent for NoteIntegrationEvent {}
