//! The transactional outbox (ADR 24): the facts a transaction makes durable with the state they
//! describe, published after the commit by a relay. A domain event is never published from
//! memory alone: `publish_domain_events()` appends it here at commit, inside the transaction, so
//! a rollback drops it with the writes it described, and `ExecutionContext::with_transaction()`
//! relays what is pending once the commit is through. A process that dies between the commit
//! and the relay delays the fact until the next relay — the next commit, or the application's
//! start — instead of losing it.
//!
//! The outbox is the unit of work's (`UnitOfWork::outbox()`), since it lives and dies with the
//! transaction, and one per process, since a relay publishes whatever is pending, whoever
//! stored it. Delivery is therefore at least once; the bus delivers a message it already
//! delivered to a subscriber once only, by the entry's id, which travels as the operation's id.
//!
//! The port is async by shape, like every port here: a store's outbox is a table. The in-memory
//! adapter is in the building blocks' Infrastructure (`outbox.rs`), a store the in-memory unit
//! of work snapshots and restores with the others.

use std::collections::BTreeSet;
use std::panic::AssertUnwindSafe;
use std::sync::{Arc, Mutex};

use futures::FutureExt;

use crate::BoxFuture;
use crate::event_bus::AnyEvent;
use crate::execution_context::{ExecutionContext, panic_message};

/// A fact made durable and not yet published: the id the message will carry, and the event.
#[derive(Clone, Debug)]
pub struct OutboxEntry {
    pub id: String,
    pub event: Arc<dyn AnyEvent>,
}

pub trait Outbox: Send + Sync {
    /// Stores the events with the transaction's writes, to be rolled back with them. The entries, in order.
    fn append(&self, events: Vec<Arc<dyn AnyEvent>>) -> BoxFuture<'_, Vec<OutboxEntry>>;
    /// What is durable and not yet published, oldest first.
    fn pending(&self) -> BoxFuture<'_, Vec<OutboxEntry>>;
    /// Acknowledges a delivery: the entry will not be published again.
    fn mark_published<'a>(&'a self, id: &'a str) -> BoxFuture<'a, ()>;
}

/// Publishes every pending entry through the context's bus, with the entry's id as the
/// operation's id, and marks it published once every reaction it reached has finished and
/// succeeded (the operation's `delivered()`), never sooner: the bus awaits the handlers inline,
/// so the dispatch returns once each reaction has committed or failed. An entry whose reaction
/// failed stays pending for the next relay, which hands it again only to the subscriber that
/// failed (the bus's inbox skips the others). An entry another relay is delivering right now is
/// not handed out a second time meanwhile, nor acknowledged by this one: a reaction that commits
/// relays in its turn, and a request on another task may relay beside it. A dispatch that panics
/// leaves the entry pending, for the next relay, and the relay goes on with the next entry: one
/// fact that cannot go out does not hold the others. The context's relay after each commit and
/// the bootstrap's at start are the two callers. Answers with the entries handed to the bus.
pub async fn relay_outbox(outbox: &dyn Outbox, context: &ExecutionContext) -> Vec<OutboxEntry> {
    let mut handed = Vec::new();
    for entry in outbox.pending().await {
        let Some(_on_its_way) = OnItsWay::take(&entry.id) else {
            continue;
        };
        let dispatch = context.publish_with_id(entry.event.clone(), entry.id.clone());
        match AssertUnwindSafe(dispatch).catch_unwind().await {
            Ok(operation) => {
                if operation.delivered() != Some(false) {
                    outbox.mark_published(&entry.id).await;
                }
                handed.push(entry);
            }
            Err(payload) => {
                if let Some(logger) = context.logger() {
                    logger.error(
                        context.trace_id(),
                        &format!("Outbox entry {} ({}) stays pending", entry.id, entry.event.name()),
                        &panic_message(payload.as_ref()),
                    );
                }
            }
        }
    }
    handed
}

/// The entries handed to the bus whose reactions have not all finished, by id: what a relay
/// running meanwhile leaves alone. Process-wide, like the bus's inbox it sits beside, and not per
/// outbox: a durable outbox is a table, and an adapter built for each unit of work is a new value
/// over the same entries, which a guard kept per value would not recognise. An entry's id is
/// unique, so the id alone names it.
static ON_THEIR_WAY: Mutex<BTreeSet<String>> = Mutex::new(BTreeSet::new());

/// An entry on its way, for as long as this lives: dropped once the relay is done with the
/// entry, a panic included.
struct OnItsWay(String);

impl OnItsWay {
    /// Takes the entry for this relay; nothing when another relay already has it.
    fn take(id: &str) -> Option<Self> {
        let key = id.to_string();
        let taken = ON_THEIR_WAY.lock().unwrap_or_else(|poisoned| poisoned.into_inner()).insert(key.clone());
        taken.then_some(Self(key))
    }
}

impl Drop for OnItsWay {
    fn drop(&mut self) {
        ON_THEIR_WAY.lock().unwrap_or_else(|poisoned| poisoned.into_inner()).remove(&self.0);
    }
}

/// The port's double for this crate's tests: a list, with ids counted up, so a test can see
/// what was stored and under which id. The real adapters are the Infrastructure's.
#[cfg(test)]
pub(crate) mod testing {
    use super::*;

    static NEXT: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(1);

    #[derive(Default)]
    pub(crate) struct FakeOutbox {
        entries: Mutex<Vec<OutboxEntry>>,
        appended: Mutex<Vec<String>>,
    }

    impl FakeOutbox {
        /// What is pending right now, without awaiting.
        pub(crate) fn entries(&self) -> Vec<OutboxEntry> {
            self.entries.lock().unwrap().clone()
        }

        /// Every id ever appended, in order, published or not.
        pub(crate) fn appended(&self) -> Vec<String> {
            self.appended.lock().unwrap().clone()
        }
    }

    impl Outbox for FakeOutbox {
        fn append(&self, events: Vec<Arc<dyn AnyEvent>>) -> BoxFuture<'_, Vec<OutboxEntry>> {
            let mut appended = self.appended.lock().unwrap();
            let mut entries = Vec::new();
            for event in events {
                // Unique in the process, as a real entry's id is: the relay's guard is process-wide.
                let n = NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                let entry = OutboxEntry { id: format!("entry-{n}"), event };
                appended.push(entry.id.clone());
                entries.push(entry);
            }
            self.entries.lock().unwrap().extend(entries.iter().cloned());
            Box::pin(async move { entries })
        }

        fn pending(&self) -> BoxFuture<'_, Vec<OutboxEntry>> {
            let pending = self.entries();
            Box::pin(async move { pending })
        }

        fn mark_published<'a>(&'a self, id: &'a str) -> BoxFuture<'a, ()> {
            self.entries.lock().unwrap().retain(|entry| entry.id != id);
            Box::pin(async {})
        }
    }
}
