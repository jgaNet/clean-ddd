//! The outbox over an in-memory store (ADR 24). It is an `InMemoryDataSource` like any other,
//! and hands its store out as a `Snapshottable` so that the in-memory unit of work snapshots
//! it when a transaction begins and puts it back on a rollback: an entry appended by a
//! transaction that fails is gone with the transaction's other writes, which is the whole point
//! of writing the facts where the state is. Insertion order is publication order; a published
//! entry is dropped rather than flagged, since nothing here reads history. One per process,
//! shared by every request's unit of work (see the bootstrap).

use std::sync::Arc;

use architecture_application::{AnyEvent, BoxFuture, Outbox, OutboxEntry};
use architecture_domain::Id;

use crate::data_sources::{InMemoryDataSource, Snapshottable};

#[derive(Default)]
pub struct InMemoryOutbox {
    store: Arc<InMemoryDataSource<OutboxEntry>>,
}

impl InMemoryOutbox {
    pub fn new() -> Self {
        Self::default()
    }

    /// The store, for the unit of work to guard with the others: what makes an entry
    /// transactional.
    pub fn store(&self) -> Arc<dyn Snapshottable> {
        Arc::new(self.store.clone())
    }
}

impl Outbox for InMemoryOutbox {
    fn append(&self, events: Vec<Arc<dyn AnyEvent>>) -> BoxFuture<'_, Vec<OutboxEntry>> {
        let entries: Vec<OutboxEntry> =
            events.into_iter().map(|event| OutboxEntry { id: Id::generate().value().to_string(), event }).collect();
        for entry in &entries {
            self.store.set(&entry.id, entry.clone());
        }
        Box::pin(async move { entries })
    }

    fn pending(&self) -> BoxFuture<'_, Vec<OutboxEntry>> {
        let pending = self.store.all();
        Box::pin(async move { pending })
    }

    fn mark_published<'a>(&'a self, id: &'a str) -> BoxFuture<'a, ()> {
        self.store.collection().shift_remove(id);
        Box::pin(async {})
    }
}

#[cfg(test)]
mod tests {
    use architecture_application::UnitOfWork;
    use architecture_domain::{DomainEvent, Event, EventKind};

    use super::*;
    use crate::unit_of_work::InMemoryUnitOfWork;

    #[derive(Debug, Clone, PartialEq)]
    struct Greeted {
        name: String,
    }
    impl Event for Greeted {
        fn name(&self) -> &'static str {
            "Greeted"
        }
        fn kind(&self) -> EventKind {
            EventKind::Domain
        }
    }
    impl DomainEvent for Greeted {}

    fn greeted(name: &str) -> Arc<dyn AnyEvent> {
        Arc::new(Greeted { name: name.into() })
    }

    fn names(entries: &[OutboxEntry]) -> Vec<String> {
        entries.iter().map(|entry| format!("{:?}", entry.event)).collect()
    }

    /// The outbox port, held by its in-memory adapter: what is appended is pending, in order,
    /// until it is published; and it lives and dies with the transaction.
    #[test]
    fn keeps_what_is_appended_pending_oldest_first_until_it_is_marked_published() {
        let outbox = InMemoryOutbox::new();

        let appended = pollster::block_on(outbox.append(vec![greeted("alice"), greeted("bob")]));
        let [first, second] = appended.as_slice() else { panic!("two entries") };
        assert_ne!(first.id, second.id);
        assert_eq!(names(&pollster::block_on(outbox.pending())), names(&appended));

        pollster::block_on(outbox.mark_published(&first.id));
        let pending = pollster::block_on(outbox.pending());
        assert_eq!(pending.iter().map(|entry| entry.id.as_str()).collect::<Vec<_>>(), [second.id.as_str()]);
    }

    #[test]
    fn is_rolled_back_with_the_transaction_that_appended_to_it_and_kept_by_one_that_commits() {
        let outbox = Arc::new(InMemoryOutbox::new());
        let unit_of_work = InMemoryUnitOfWork::new(vec![outbox.store()], outbox.clone());

        pollster::block_on(unit_of_work.begin_transaction());
        pollster::block_on(outbox.append(vec![greeted("rolled back")]));
        pollster::block_on(unit_of_work.rollback_transaction());
        assert!(pollster::block_on(outbox.pending()).is_empty());

        pollster::block_on(unit_of_work.begin_transaction());
        pollster::block_on(outbox.append(vec![greeted("committed")]));
        pollster::block_on(unit_of_work.commit_transaction());
        assert_eq!(names(&pollster::block_on(outbox.pending())), ["Greeted { name: \"committed\" }"]);
    }
}
