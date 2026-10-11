//! The Application layer of the Notes context: its use cases — the commands that change a note,
//! the queries that read one, the reactions to its facts — and the one port the layer owns,
//! for a decision the domain cannot make from its own state (ADR 7).
//!
//! This crate's `Cargo.toml` is its row of the dependency table (`ARCH-APPLICATION`): its own
//! Domain, the building blocks' and the shared kernel's Domain and Application, nothing else.
//! Its tests use its own Infrastructure as doubles (`ARCH-APPLICATION-SPECS`), as dev-dependencies.

pub mod commands;
pub mod events;
pub mod queries;
pub mod suggestions;

/// The context that refuses, named in every guard and exception.
pub use notes_domain::note::note_exceptions::SERVICE;
