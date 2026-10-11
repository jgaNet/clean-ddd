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

use std::sync::{Arc, Mutex};

use architecture_application::{BoxFuture, UnitOfWork};

use crate::data_sources::Snapshottable;

/// The way to put one store back as it was when the transaction began.
type Restore = Box<dyn FnOnce() + Send>;

pub struct InMemoryUnitOfWork {
    stores: Vec<Arc<dyn Snapshottable>>,
    restore: Mutex<Option<Vec<Restore>>>,
}

impl InMemoryUnitOfWork {
    pub fn new(stores: Vec<Arc<dyn Snapshottable>>) -> Self {
        Self { stores, restore: Mutex::new(None) }
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
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::data_sources::InMemoryDataSource;

    fn stores() -> (Arc<InMemoryDataSource<String>>, Arc<InMemoryDataSource<String>>, InMemoryUnitOfWork) {
        let notes = Arc::new(InMemoryDataSource::<String>::new());
        let accounts = Arc::new(InMemoryDataSource::<String>::new());
        notes.set("n1", "before".into());
        let unit_of_work = InMemoryUnitOfWork::new(vec![Arc::new(notes.clone()), Arc::new(accounts.clone())]);
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
}
