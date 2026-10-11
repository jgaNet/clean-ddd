//! The Domain layer of the Notes context: the `Note` aggregate and everything around it — its
//! value objects, its events, its exceptions, its snapshot, its ports, and the domain service
//! that shares a note with an account another context owns.
//!
//! This crate's `Cargo.toml` is its row of the dependency table (`ARCH-DOMAIN`): the building
//! blocks' Domain, the shared kernel's Domain, nothing else. No logging, no HTTP, no persistence
//! and no other context ever appears here; the compiler refuses the import before a linter would.

pub mod note;
