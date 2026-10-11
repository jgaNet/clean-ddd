//! `Event`: a named, immutable payload. Every message in the system is one.
//!
//! - Commands ([`CommandEvent`]) ask for something to happen: `CreateNote`
//! - Domain events ([`DomainEvent`]) state that something happened inside a context: `NoteArchived`
//! - Integration events ([`IntegrationEvent`]) tell other contexts about it: `NoteSharedIntegrationEvent`
//!
//! The three kinds share one shape (a name and a payload) and differ in intent, which is why
//! they are distinct traits: a handler, a bus decorator or a test can tell them apart by type.
//!
//! In Rust an event is a value by construction: the idiom is **one enum per aggregate**, one
//! variant per fact with the payload as named fields, deriving `PartialEq` so that a test
//! asserting an event asserts what it says. The name is the channel the event bus routes on;
//! it is written once, in `name()`, and it is the variant's.
//!
//! ```ignore
//! #[derive(Debug, Clone, PartialEq)]
//! pub enum NoteEvent { Archived { note_id: String }, /* … */ }
//! impl Event for NoteEvent { fn name(&self) -> &'static str { match self { Self::Archived { .. } => "NoteArchived" } } }
//! impl DomainEvent for NoteEvent {}
//! ```

use std::fmt;

/// A named, immutable payload: what every message in the system is.
pub trait Event: fmt::Debug + Clone + PartialEq {
    /// The name the bus routes on: the fact, in PascalCase and the past tense for a domain event.
    fn name(&self) -> &'static str;
}

/// A request that something happen; one handler, may be refused.
pub trait CommandEvent: Event {}

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
    }
    impl DomainEvent for Greeting {}

    #[test]
    fn is_named_after_its_fact_and_carries_its_payload_where_a_comparison_can_see_it() {
        let event = Greeting::Greeted { name: "alice".into() };

        assert_eq!(event.name(), "Greeted");
        assert_eq!(event, Greeting::Greeted { name: "alice".into() });
    }

    #[test]
    fn compares_by_payload_so_a_test_asserting_an_event_asserts_what_it_says() {
        assert_ne!(Greeting::Greeted { name: "alice".into() }, Greeting::Greeted { name: "bob".into() });
        assert_ne!(Greeting::Greeted { name: "alice".into() }, Greeting::Waved { name: "alice".into() });
    }
}
