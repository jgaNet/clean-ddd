//! The transaction boundary over the in-memory stores. `begin_transaction()` snapshots every
//! store it was given, `commit_transaction()` drops the snapshots, and `rollback_transaction()`
//! puts the stores back as they were: after a rollback, nothing the transaction saved remains,
//! which is what `ExecutionContext::with_transaction()` promises.
//!
//! Honest limit: the snapshot is of the whole store, so two transactions interleaving writes are
//! not isolated from each other — a rollback undoes everything written since it began, including
//! another request's work. What these four methods give you is a transaction *boundary*, not
//! isolation; a database gives both, through the same four methods (ADR 3). One instance per
//! request, over the stores the composition root lists.
//!
//! The outbox is one of the stores (ADR 24): the process's `InMemoryOutbox` hands its store out
//! (`store()`) and the composition root lists it with the others, so an entry appended by a
//! transaction that rolls back is gone with the transaction's writes, and one that commits is
//! durable for the relay.
//!
//! A reaction's transaction is its own (ADR 30): `another()` is a unit of work over the same
//! stores and outbox, which the base event handler opens and commits or rolls back around the
//! reaction. The tests at the bottom hold that over these real pieces: a reaction that succeeds
//! commits what it saved and tells other contexts after the commit, through the outbox; one that
//! fails half-way leaves nothing; two reactions to one fact run beside each other and beside the
//! publisher's transaction.

use std::sync::{Arc, Mutex};

use architecture_application::{BoxFuture, Outbox, UnitOfWork};

use crate::data_sources::Snapshottable;

/// The way to put one store back as it was when the transaction began.
type Restore = Box<dyn FnOnce() + Send>;

pub struct InMemoryUnitOfWork {
    stores: Vec<Arc<dyn Snapshottable>>,
    outbox: Arc<dyn Outbox>,
    restore: Mutex<Option<Vec<Restore>>>,
}

impl InMemoryUnitOfWork {
    /// Over the stores it guards — the outbox's among them, or its entries would survive a
    /// rollback — and the outbox the transaction writes its facts to.
    pub fn new(stores: Vec<Arc<dyn Snapshottable>>, outbox: Arc<dyn Outbox>) -> Self {
        Self { stores, outbox, restore: Mutex::new(None) }
    }

    fn restore(&self) -> std::sync::MutexGuard<'_, Option<Vec<Restore>>> {
        self.restore.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

impl UnitOfWork for InMemoryUnitOfWork {
    /// # Panics
    ///
    /// When a transaction is already in progress: a programming error, not a refusal.
    fn begin_transaction(&self) -> BoxFuture<'_, ()> {
        let mut restore = self.restore();
        assert!(restore.is_none(), "Transaction already in progress");
        *restore = Some(self.stores.iter().map(|store| store.snapshot()).collect());
        Box::pin(async {})
    }

    /// # Panics
    ///
    /// When no transaction is active.
    fn commit_transaction(&self) -> BoxFuture<'_, ()> {
        let dropped = self.restore().take();
        assert!(dropped.is_some(), "No active transaction to commit");
        Box::pin(async {})
    }

    /// # Panics
    ///
    /// When no transaction is active.
    fn rollback_transaction(&self) -> BoxFuture<'_, ()> {
        let restores = self.restore().take().expect("No active transaction to rollback");
        for restore in restores {
            restore();
        }
        Box::pin(async {})
    }

    fn has_active_transaction(&self) -> bool {
        self.restore().is_some()
    }

    fn outbox(&self) -> &dyn Outbox {
        self.outbox.as_ref()
    }

    /// The same stores and outbox, for a transaction of its own: a reaction's (ADR 30).
    fn another(&self) -> Arc<dyn UnitOfWork> {
        Arc::new(InMemoryUnitOfWork::new(self.stores.clone(), self.outbox.clone()))
    }
}

#[cfg(test)]
mod tests {
    use std::future::poll_fn;
    use std::task::Poll;

    use architecture_application::{
        AnyHandler, Auth, EventBus, EventHandler, ExecutionContext, ExecutionContextOptions, Operation,
        OperationStatus, publish_integration_event,
    };
    use architecture_domain::{DomainEvent, DomainResult, Event, EventKind, Exception, IntegrationEvent};

    use super::*;
    use crate::data_sources::InMemoryDataSource;
    use crate::outbox::InMemoryOutbox;

    fn stores() -> (Arc<InMemoryDataSource<String>>, Arc<InMemoryDataSource<String>>, InMemoryUnitOfWork) {
        let notes = Arc::new(InMemoryDataSource::<String>::new());
        let accounts = Arc::new(InMemoryDataSource::<String>::new());
        notes.set("n1", "before".into());
        let outbox = Arc::new(InMemoryOutbox::new());
        let unit_of_work =
            InMemoryUnitOfWork::new(vec![Arc::new(notes.clone()), Arc::new(accounts.clone()), outbox.store()], outbox);
        (notes, accounts, unit_of_work)
    }

    #[test]
    fn keeps_what_a_committed_transaction_wrote() {
        let (notes, accounts, unit_of_work) = stores();

        pollster::block_on(unit_of_work.begin_transaction());
        notes.set("n1", "after".into());
        accounts.set("a1", "alice@example.com".into());
        pollster::block_on(unit_of_work.commit_transaction());

        assert_eq!(notes.get("n1").as_deref(), Some("after"));
        assert_eq!(accounts.get("a1").as_deref(), Some("alice@example.com"));
    }

    #[test]
    fn puts_every_store_back_as_it_was_when_the_transaction_rolls_back() {
        let (notes, accounts, unit_of_work) = stores();

        pollster::block_on(unit_of_work.begin_transaction());
        notes.set("n1", "after".into());
        notes.set("n2", "new".into());
        accounts.set("a1", "alice@example.com".into());
        pollster::block_on(unit_of_work.rollback_transaction());

        assert_eq!(notes.all(), ["before"]);
        assert!(accounts.is_empty());
        assert!(!unit_of_work.has_active_transaction());
    }

    #[test]
    fn pins_the_honest_limit_two_requests_over_the_same_stores_are_a_boundary_each_not_isolated_a_rollback_undoes_the_other_one_too()
     {
        let (notes, accounts, unit_of_work) = stores();
        let other = InMemoryUnitOfWork::new(
            vec![Arc::new(notes.clone()), Arc::new(accounts.clone())],
            Arc::new(InMemoryOutbox::new()),
        );

        pollster::block_on(unit_of_work.begin_transaction());
        notes.set("n1", "first writer".into());
        pollster::block_on(other.begin_transaction());
        notes.set("n2", "second writer".into());
        pollster::block_on(other.commit_transaction());
        pollster::block_on(unit_of_work.rollback_transaction());

        assert_eq!(notes.get("n1").as_deref(), Some("before"));
        // The second writer committed, and its write is gone with the first one's rollback: the
        // snapshot is of the whole store. A database keeps n2 here; the README lists this as the
        // gap it is.
        assert!(notes.get("n2").is_none());
    }

    #[test]
    #[should_panic(expected = "already in progress")]
    fn allows_one_transaction_at_a_time() {
        let (_, _, unit_of_work) = stores();
        pollster::block_on(unit_of_work.begin_transaction());
        pollster::block_on(unit_of_work.begin_transaction());
    }

    #[test]
    #[should_panic(expected = "No active transaction")]
    fn only_commits_an_open_transaction() {
        let (_, _, unit_of_work) = stores();
        pollster::block_on(unit_of_work.commit_transaction());
    }

    // A reaction's transaction is its own (ADR 30): what it saves and what it tells other
    // contexts commit together, or neither does.

    #[derive(Debug, Clone, PartialEq)]
    struct Greeted {
        fail: bool,
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

    #[derive(Debug, Clone, PartialEq)]
    struct Told {
        who: &'static str,
    }
    impl Event for Told {
        fn name(&self) -> &'static str {
            "Told"
        }
        fn kind(&self) -> EventKind {
            EventKind::Integration
        }
    }
    impl IntegrationEvent for Told {}

    /// Saves one line per person and tells other contexts about each; told to, it fails at the second.
    struct OnGreetedSaveAndTell {
        store: Arc<InMemoryDataSource<String>>,
    }
    impl EventHandler for OnGreetedSaveAndTell {
        type Event = Greeted;
        async fn execute(&self, event: Greeted, context: &ExecutionContext) -> DomainResult {
            yield_once().await; // lets a reaction beside it run, as an awaited store would
            for who in ["ann", "bob"] {
                self.store.set(who, "told".into());
                publish_integration_event(Told { who }, context).await;
                if event.fail && who == "bob" {
                    return Err(Exception::not_found("Test", "bob is gone"));
                }
            }
            Ok(())
        }
    }

    /// Pending once, then ready: hands the executor to whatever else it is polling.
    async fn yield_once() {
        let mut yielded = false;
        poll_fn(|cx| {
            if yielded {
                return Poll::Ready(());
            }
            yielded = true;
            cx.waker().wake_by_ref();
            Poll::Pending
        })
        .await;
    }

    /// Records who was told, under which id, and whether that id was an outbox entry still pending
    /// when the bus got it: durable first, then published.
    struct TellingBus {
        outbox: Arc<InMemoryOutbox>,
        told: Mutex<Vec<(&'static str, String, bool)>>,
    }
    impl TellingBus {
        fn told(&self) -> Vec<(&'static str, String, bool)> {
            self.told.lock().unwrap().clone()
        }
    }
    impl EventBus for TellingBus {
        fn connect(&self) -> BoxFuture<'_, ()> {
            Box::pin(async {})
        }
        fn dispatch(&self, operation: Operation) -> BoxFuture<'_, Operation> {
            Box::pin(async move {
                let durable = self.outbox.pending().await.iter().any(|entry| entry.id == operation.id());
                let told = operation.event_as::<Told>().expect("only Told is relayed here").who;
                self.told.lock().unwrap().push((told, operation.id().to_string(), durable));
                operation
            })
        }
        fn subscribe(&self, _channel: &'static str, _handler: Arc<dyn AnyHandler>) -> BoxFuture<'_, ()> {
            Box::pin(async {})
        }
    }

    struct Reaction {
        store: Arc<InMemoryDataSource<String>>,
        outbox: Arc<InMemoryOutbox>,
        publisher: Arc<InMemoryUnitOfWork>,
        bus: Arc<TellingBus>,
    }

    impl Reaction {
        fn new() -> Self {
            let store = Arc::new(InMemoryDataSource::<String>::new());
            let outbox = Arc::new(InMemoryOutbox::new());
            let publisher =
                Arc::new(InMemoryUnitOfWork::new(vec![Arc::new(store.clone()), outbox.store()], outbox.clone()));
            let bus = Arc::new(TellingBus { outbox: outbox.clone(), told: Mutex::new(Vec::new()) });
            Self { store, outbox, publisher, bus }
        }

        /// The fact as the bus hands it to a reaction: with the publisher's context.
        fn fact(&self, fail: bool) -> Operation {
            let context = ExecutionContext::new(ExecutionContextOptions {
                trace_id: "trace".into(),
                auth: Auth::anonymous(),
                event_bus: self.bus.clone(),
                unit_of_work: Some(self.publisher.clone()),
                logger: None,
            });
            Operation::new(Arc::new(Greeted { fail }), context)
        }

        fn handler(&self) -> OnGreetedSaveAndTell {
            OnGreetedSaveAndTell { store: self.store.clone() }
        }
    }

    #[test]
    fn a_reaction_commits_what_it_saved_and_tells_other_contexts_after_the_commit_through_the_outbox_under_the_entry_ids()
     {
        let reaction = Reaction::new();

        let done = pollster::block_on(reaction.handler().handle(reaction.fact(false)));

        assert_eq!(done.status(), OperationStatus::Sent);
        assert_eq!(reaction.store.collection().keys().collect::<Vec<_>>(), ["ann", "bob"]);
        let told = reaction.bus.told();
        assert_eq!(
            told.iter().map(|(who, _, durable)| (*who, *durable)).collect::<Vec<_>>(),
            [("ann", true), ("bob", true)]
        );
        assert_ne!(told[0].1, told[1].1);
        assert!(pollster::block_on(reaction.outbox.pending()).is_empty());
    }

    #[test]
    fn a_reaction_that_fails_half_way_is_undone_whole_nothing_saved_nothing_told_so_a_second_delivery_starts_clean() {
        let reaction = Reaction::new();

        let done = pollster::block_on(reaction.handler().handle(reaction.fact(true)));

        assert_eq!(done.status(), OperationStatus::Error);
        assert!(reaction.store.is_empty());
        assert!(reaction.bus.told().is_empty());
        assert!(pollster::block_on(reaction.outbox.pending()).is_empty());
    }

    #[test]
    fn a_reaction_runs_beside_another_reaction_to_the_same_fact_and_beside_the_open_transaction_that_published_it() {
        let reaction = Reaction::new();
        let fact = reaction.fact(false);
        pollster::block_on(reaction.publisher.begin_transaction()); // the publisher's, still open while it relays

        let (first, second) = pollster::block_on(futures::future::join(
            reaction.handler().handle(fact.clone()),
            reaction.handler().handle(fact),
        ));

        assert_eq!([first.status(), second.status()], [OperationStatus::Sent, OperationStatus::Sent]);
        assert_eq!(reaction.bus.told().len(), 4);
        assert!(reaction.publisher.has_active_transaction()); // still the publisher's to close
    }
}
