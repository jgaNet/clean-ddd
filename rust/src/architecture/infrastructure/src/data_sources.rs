//! A map used as a database. Repositories and queries of a context share one instance, which is
//! all the "persistence" this reference project needs: the ports they implement are what a real
//! database adapter would implement instead.
//!
//! The in-memory unit of work snapshots every store it is given when a transaction begins and
//! puts them back if it rolls back; a database would keep that undo log itself, here the store
//! does. The stores keep insertion order, which is the order the queries promise.

use std::sync::{Arc, Mutex, MutexGuard};

use indexmap::IndexMap;

/// A store the unit of work can snapshot and put back, whatever it holds.
pub trait Snapshottable: Send + Sync {
    /// A copy of the store as it is now, and the way to put it back.
    fn snapshot(&self) -> Box<dyn FnOnce() + Send>;
}

pub struct InMemoryDataSource<Model: Clone + Send + 'static> {
    collection: Mutex<IndexMap<String, Model>>,
}

impl<Model: Clone + Send + 'static> Default for InMemoryDataSource<Model> {
    fn default() -> Self {
        Self::new()
    }
}

impl<Model: Clone + Send + 'static> InMemoryDataSource<Model> {
    pub fn new() -> Self {
        Self { collection: Mutex::new(IndexMap::new()) }
    }

    /// The store, locked; an adapter reads or writes through it and lets go at once.
    pub fn collection(&self) -> MutexGuard<'_, IndexMap<String, Model>> {
        self.collection.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    pub fn get(&self, id: &str) -> Option<Model> {
        self.collection().get(id).cloned()
    }

    pub fn set(&self, id: &str, model: Model) {
        self.collection().insert(id.to_string(), model);
    }

    pub fn all(&self) -> Vec<Model> {
        self.collection().values().cloned().collect()
    }

    pub fn len(&self) -> usize {
        self.collection().len()
    }

    pub fn is_empty(&self) -> bool {
        self.collection().is_empty()
    }

    pub fn reset(&self) {
        self.collection().clear();
    }
}

impl<Model: Clone + Send + 'static> Snapshottable for Arc<InMemoryDataSource<Model>> {
    fn snapshot(&self) -> Box<dyn FnOnce() + Send> {
        let copy = self.collection().clone();
        let store = self.clone();
        Box::new(move || *store.collection() = copy)
    }
}
