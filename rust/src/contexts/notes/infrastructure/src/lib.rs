//! The Infrastructure layer of the Notes context: the adapters of its ports. The in-memory pair
//! is what the local wiring uses; a database adapter implements the same traits and is added to
//! the contract test's `adapters`, which is the whole review.

pub mod queries;
pub mod repositories;
pub mod suggestions;

#[cfg(test)]
mod persistence_contract;
