//! The Infrastructure layer of the Notes context: the adapters of its ports. The in-memory pair
//! is what the local wiring uses; the SQLite pair is the same two ports over a real database,
//! and the contract test holds both to the same expectations, which is the whole review of an
//! adapter. The directory is the adapter over another context's read model: the read-side
//! counterpart of an anti-corruption layer.

pub mod directories;
pub mod notes_table;
pub mod queries;
pub mod repositories;
pub mod suggestions;

#[cfg(test)]
mod persistence_contract;
