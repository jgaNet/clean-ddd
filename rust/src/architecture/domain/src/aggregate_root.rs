//! `AggregateRoot` is the entry point of an aggregate: a cluster of objects that must always be
//! consistent together and that is loaded and saved as a whole.
//!
//! On top of its identity, an aggregate root records the domain events raised by its own
//! behaviour. The domain decides *that* something happened; the application layer decides
//! *when* to publish it (after the aggregate is saved, ADR 3).
//!
//! It also carries the **version** it was loaded with, so that a repository can refuse to save
//! it over a newer one: two writers who read the same version cannot both win (ADR 8). A new
//! aggregate is version 0; the repository stores version + 1 on every save. The aggregate never
//! changes its own version: it is a fact about what was read, not about what happened.
//!
//! Rust has no inheritance, so an aggregate *holds* one of these in a private field and
//! delegates to it:
//!
//! ```ignore
//! pub struct Note { root: AggregateRoot<NoteEvent>, owner_id: Id, /* … */ }
//! impl Entity for Note { fn id(&self) -> &Id { self.root.id() } }
//! // inside a behaviour:           self.root.record(NoteEvent::Archived { note_id });
//! // inside a command handler:     publish_domain_events(note.pull_domain_events(), context)
//! ```
//!
//! `record` is public on this struct and the field holding it is private to the aggregate, so
//! only the aggregate's own behaviours can record a fact (DOMAIN-RECORDS-EVENTS). See `Note` in
//! the Notes context for a complete example.

use crate::entity::Entity;
use crate::event::DomainEvent;
use crate::id::Id;

/// What an aggregate is to the rest of the system: an entity that records domain events. An
/// aggregate holds an [`AggregateRoot`] in a private field and delegates this to it; a command
/// handler hands the aggregate to `publish_domain_events` once it is saved.
pub trait Aggregate: Entity {
    type Event: DomainEvent;
    fn pull_domain_events(&mut self) -> Vec<Self::Event>;
}

#[derive(Debug)]
pub struct AggregateRoot<E: DomainEvent> {
    id: Id,
    version: u64,
    domain_events: Vec<E>,
}

impl<E: DomainEvent> AggregateRoot<E> {
    /// A root at the version it was read at: 0 when it was just created.
    pub fn new(id: Id, version: u64) -> Self {
        Self { id, version, domain_events: Vec::new() }
    }

    pub fn id(&self) -> &Id {
        &self.id
    }

    /// The version this aggregate was loaded with (0 when it was just created).
    pub fn version(&self) -> u64 {
        self.version
    }

    /// Records a fact the behaviour that calls this has just made true.
    pub fn record(&mut self, event: E) {
        self.domain_events.push(event);
    }

    /// The facts recorded since the last pull, in order; the root forgets them.
    pub fn pull_domain_events(&mut self) -> Vec<E> {
        std::mem::take(&mut self.domain_events)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::event::Event;

    #[derive(Debug, Clone, PartialEq)]
    enum Happened {
        Something,
    }
    impl Event for Happened {
        fn name(&self) -> &'static str {
            "Something"
        }
    }
    impl DomainEvent for Happened {}

    #[test]
    fn starts_at_version_zero_and_keeps_the_version_it_was_read_at() {
        assert_eq!(AggregateRoot::<Happened>::new(Id::new("a"), 0).version(), 0);
        assert_eq!(AggregateRoot::<Happened>::new(Id::new("a"), 7).version(), 7);
    }

    #[test]
    fn records_events_and_hands_them_out_once() {
        let mut root = AggregateRoot::new(Id::new("a"), 0);
        root.record(Happened::Something);

        assert_eq!(root.pull_domain_events(), vec![Happened::Something]);
        assert_eq!(root.pull_domain_events(), vec![]);
    }
}
