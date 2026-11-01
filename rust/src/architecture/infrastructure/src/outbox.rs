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
    use std::sync::Mutex;

    use architecture_application::{
        Auth, EventBus, EventHandler, EventSubscriber, ExecutionContext, ExecutionContextOptions, UnitOfWork,
        relay_outbox,
    };
    use architecture_domain::{DomainEvent, DomainResult, Event, EventKind, Exception};
    use futures::channel::oneshot;

    use super::*;
    use crate::event_bus::InMemoryEventBus;
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

    #[derive(Debug, Clone, PartialEq)]
    struct BookingConfirmed {
        booking_id: &'static str,
    }
    impl Event for BookingConfirmed {
        fn name(&self) -> &'static str {
            "BookingConfirmed"
        }
        fn kind(&self) -> EventKind {
            EventKind::Domain
        }
    }
    impl DomainEvent for BookingConfirmed {}

    /// A reaction that waits until the test lets it finish, and fails while `failing` says so.
    #[derive(Default)]
    struct TellTheHost {
        handled: Mutex<usize>,
        failing: Mutex<bool>,
        gate: Mutex<Option<oneshot::Receiver<()>>>,
    }
    impl TellTheHost {
        /// The next reaction waits until what this answers is sent.
        fn hold(&self) -> oneshot::Sender<()> {
            let (release, gate) = oneshot::channel();
            *self.gate.lock().unwrap() = Some(gate);
            release
        }
        fn handled(&self) -> usize {
            *self.handled.lock().unwrap()
        }
        fn fail(&self, failing: bool) {
            *self.failing.lock().unwrap() = failing;
        }
    }
    impl EventHandler for TellTheHost {
        type Event = BookingConfirmed;
        async fn execute(&self, _event: BookingConfirmed, _context: &ExecutionContext) -> DomainResult {
            *self.handled.lock().unwrap() += 1;
            let gate = self.gate.lock().unwrap().take();
            if let Some(gate) = gate {
                gate.await.expect("released");
            }
            if *self.failing.lock().unwrap() {
                return Err(Exception::not_found("Test", "the service refused"));
            }
            Ok(())
        }
    }

    /// A bus with the reactions subscribed in order, and a context on it to relay with.
    fn relaying_to(reactions: &[&Arc<EventSubscriber<TellTheHost>>]) -> ExecutionContext {
        let bus = Arc::new(InMemoryEventBus::new());
        for reaction in reactions {
            pollster::block_on(bus.subscribe("BookingConfirmed", (*reaction).clone()));
        }
        ExecutionContext::new(ExecutionContextOptions {
            trace_id: "relay".into(),
            auth: Auth::anonymous(),
            event_bus: bus,
            unit_of_work: None,
            logger: None,
        })
    }

    fn pending_ids(outbox: &InMemoryOutbox) -> Vec<String> {
        pollster::block_on(outbox.pending()).into_iter().map(|entry| entry.id).collect()
    }

    fn confirmed(outbox: &InMemoryOutbox, booking_id: &'static str) -> String {
        let entries = pollster::block_on(outbox.append(vec![Arc::new(BookingConfirmed { booking_id })]));
        entries[0].id.clone()
    }

    /// The relay acknowledges an entry once every reaction it reached has committed, never sooner
    /// (ADR 24): a process that dies while a reaction runs has not lost the fact. A relay that
    /// runs meanwhile (a reaction's commit, another request's) leaves the entry alone.
    #[test]
    fn the_relay_keeps_an_entry_pending_while_a_reaction_to_it_runs_and_hands_it_out_once_meanwhile() {
        let reaction = Arc::new(EventSubscriber(TellTheHost::default()));
        let context = relaying_to(&[&reaction]);
        let outbox = InMemoryOutbox::new();
        let entry = confirmed(&outbox, "b-1");

        let release = reaction.0.hold();
        let first = relay_outbox(&outbox, &context);
        let meanwhile = async {
            assert_eq!(reaction.0.handled(), 1, "the first relay's reaction is running");
            // The reaction has not committed: a crash now must find the fact still owed.
            assert_eq!(pending_ids(&outbox), std::slice::from_ref(&entry));
            // A second relay does not hand out an entry already on its way, nor acknowledge it.
            assert!(relay_outbox(&outbox, &context).await.is_empty());
            assert_eq!(reaction.0.handled(), 1);
            assert_eq!(pending_ids(&outbox), std::slice::from_ref(&entry));
            release.send(()).expect("the reaction waits");
        };
        pollster::block_on(async { futures::join!(first, meanwhile) });

        assert!(pending_ids(&outbox).is_empty());
    }

    /// An entry whose reaction failed stays pending, and the next relay hands it only to the
    /// subscriber that failed. In either order: the refusal is the operation's last word, or it is
    /// overwritten by the next subscriber's success, so the relay cannot go by the status.
    #[test]
    fn the_relay_keeps_an_entry_whose_reaction_failed_pending_and_hands_it_again_to_that_subscriber_only() {
        for refused_first in [false, true] {
            let told = Arc::new(EventSubscriber(TellTheHost::default()));
            let refused = Arc::new(EventSubscriber(TellTheHost::default()));
            let context = relaying_to(&if refused_first { [&refused, &told] } else { [&told, &refused] });
            let outbox = InMemoryOutbox::new();
            let entry = confirmed(&outbox, "b-2");

            refused.0.fail(true);
            pollster::block_on(relay_outbox(&outbox, &context));
            assert_eq!(pending_ids(&outbox), [entry], "refused first: {refused_first}");

            refused.0.fail(false);
            pollster::block_on(relay_outbox(&outbox, &context));
            assert!(pending_ids(&outbox).is_empty(), "refused first: {refused_first}");
            assert_eq!([told.0.handled(), refused.0.handled()], [1, 2], "refused first: {refused_first}");
        }
    }
}
