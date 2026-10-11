//! The shared kernel, in the DDD sense: the small part of the domain model every context
//! agrees on. Two things today, an `Email` and the `Role`s; the published contracts between
//! contexts will be next door, in the shared kernel's Application layer.
//!
//! This crate depends on the building blocks' Domain and on nothing else (ARCH-TREES): it is
//! vocabulary built on mechanics, and no context's.

pub mod email;
pub mod role;

pub use email::{Email, INVALID_EMAIL_FORMAT};
pub use role::Role;
