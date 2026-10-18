//! The Infrastructure layer of the Notes context: the adapters of its ports. The in-memory pair
//! is what the local wiring uses; a database adapter implements the same traits and is added to
//! the contract test's `adapters`, which is the whole review. The directory is the adapter over
//! another context's read model: the read-side counterpart of an anti-corruption layer.

pub mod directories;
pub mod queries;
pub mod repositories;
pub mod suggestions;

#[cfg(test)]
mod persistence_contract;
