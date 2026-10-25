//! `Event`: a named, immutable payload. Every message in the system is one.
//!
//! - Commands ([`CommandEvent`]) ask for something to happen: `CreateNote`
//! - Domain events ([`DomainEvent`]) state that something happened inside a context: `NoteArchived`
//! - Integration events ([`IntegrationEvent`]) tell other contexts about it: `NoteSharedIntegrationEvent`
//!
//! The three kinds share one shape (a name and a payload) and differ in intent, which is why
//! they are distinct traits: a handler or a test can tell them apart by type. On the bus they
//! travel type-erased, so each also says its [`EventKind`]: that is how the Tracker knows that
//! an operation is a command's, which a client waits on, and not a reaction's.
//!
//! In Rust an event is a value by construction: the idiom is **one enum per aggregate**, one
//! variant per fact with the payload as named fields, deriving `PartialEq` so that a test
//! asserting an event asserts what it says. The name is the channel the event bus routes on;
//! it is written once, in `name()`, and it is the variant's.
//!
//! ```ignore
//! #[derive(Debug, Clone, PartialEq)]
//! pub enum NoteEvent { Archived { note_id: String }, /* … */ }
//! impl Event for NoteEvent {
//!     fn name(&self) -> &'static str { match self { Self::Archived { .. } => "NoteArchived" } }
//!     fn kind(&self) -> EventKind { EventKind::Domain }
//! }
//! impl DomainEvent for NoteEvent {}
//! ```

use std::fmt;

/// Which of the three kinds a message is, for whoever sees it type-erased (the bus, the Tracker).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EventKind {
    Command,
    Domain,
    Integration,
}

/// A named, immutable payload: what every message in the system is.
pub trait Event: fmt::Debug + Clone + PartialEq {
    /// The name the bus routes on: the fact, in PascalCase and the past tense for a domain event.
    fn name(&self) -> &'static str;
    /// A command, a domain event or an integration event; the same answer as the marker trait it implements.
    fn kind(&self) -> EventKind;
}

/// The name a message has outside the process — on an operation record, in a completion notice:
/// its intent or its fact, without the suffix that names its kind here (`ShareNote`, `NoteShared`,
/// `OperationComplete`). The bus keeps routing on the full name; the suffix is this codebase's
/// naming convention, and every language of the reference answers the same API (API-ONE-SURFACE).
pub fn public_name(name: &str) -> &str {
    ["CommandEvent", "IntegrationEvent", "Event"].iter().find_map(|suffix| name.strip_suffix(suffix)).unwrap_or(name)
}

/// A request that something happen; one handler, may be refused. A command is a struct with
/// one name, which is the channel its handler is subscribed on, and says what its handler
/// answers with (the id of what it created, a suggestion; `()` when nothing).
pub trait CommandEvent: Event {
    const NAME: &'static str;
    type Output: Send + Sync + 'static;
}

/// A fact that happened inside a context; recorded by an aggregate, published after commit.
pub trait DomainEvent: Event {}

/// A fact restated for other contexts: a context's published contract, kept in the shared kernel.
pub trait IntegrationEvent: Event {}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Debug, Clone, PartialEq)]
    enum Greeting {
        Greeted { name: String },
        Waved { name: String },
    }
    impl Event for Greeting {
        fn name(&self) -> &'static str {
            match self {
                Greeting::Greeted { .. } => "Greeted",
                Greeting::Waved { .. } => "Waved",
            }
        }
        fn kind(&self) -> EventKind {
            EventKind::Domain
        }
    }
    impl DomainEvent for Greeting {}

    #[test]
    fn is_named_after_its_fact_and_carries_its_payload_where_a_comparison_can_see_it() {
        let event = Greeting::Greeted { name: "alice".into() };

        assert_eq!(event.name(), "Greeted");
        assert_eq!(event.kind(), EventKind::Domain);
        assert_eq!(event, Greeting::Greeted { name: "alice".into() });
    }

    #[test]
    fn compares_by_payload_so_a_test_asserting_an_event_asserts_what_it_says() {
        assert_ne!(Greeting::Greeted { name: "alice".into() }, Greeting::Greeted { name: "bob".into() });
        assert_ne!(Greeting::Greeted { name: "alice".into() }, Greeting::Waved { name: "alice".into() });
    }
}
