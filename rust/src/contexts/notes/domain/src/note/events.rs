//! Domain events are facts, named in the past tense, recorded by the `Note` aggregate when
//! something meaningful happened. They carry just enough data for a listener to react.
//!
//! They stay inside the Notes context. When another context must know, an application handler
//! translates them into an integration event. One enum, one variant per fact: the payload is
//! the variant's fields, and a test compares the whole value.

use architecture_domain::{DomainEvent, Event};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum NoteEvent {
    Created { note_id: String, owner_id: String, title: String },
    Edited { note_id: String, title: String },
    Archived { note_id: String },
    Restored { note_id: String },
    Shared { note_id: String, title: String, owner_id: String, recipient_id: String },
}

impl Event for NoteEvent {
    fn name(&self) -> &'static str {
        match self {
            NoteEvent::Created { .. } => "NoteCreated",
            NoteEvent::Edited { .. } => "NoteEdited",
            NoteEvent::Archived { .. } => "NoteArchived",
            NoteEvent::Restored { .. } => "NoteRestored",
            NoteEvent::Shared { .. } => "NoteShared",
        }
    }
}

impl DomainEvent for NoteEvent {}
