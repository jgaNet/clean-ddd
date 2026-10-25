//! The building blocks every domain is written with: identity, entities, aggregates, value
//! objects, events, results and exceptions. They know nothing of any context, and nothing of
//! the shared kernel either: the mechanics of the architecture, not its vocabulary.
//!
//! This crate is the `Domain` layer of the building blocks. Its `Cargo.toml` depends on no
//! other crate of this repository, which is the row `ARCH-DOMAIN` gives it and what
//! `ARCH-TREES` demands; the compiler holds both.
//!
//! Where the TypeScript building blocks are base classes, these are traits and one generic
//! struct: Rust has no inheritance, so an aggregate *holds* an [`AggregateRoot`] rather than
//! extending one, a value object *is* a newtype that derives `PartialEq`, and a refusal *is* a
//! [`DomainResult`] — the language's own `Result`, which is what ADR 1 asked for.

pub mod aggregate_root;
pub mod common_exceptions;
pub mod entity;
pub mod event;
pub mod exception;
pub mod id;
pub mod result;
pub mod value_object;

pub use aggregate_root::{Aggregate, AggregateRoot};
pub use entity::Entity;
pub use event::{CommandEvent, DomainEvent, Event, EventKind, IntegrationEvent, public_name};
pub use exception::Exception;
pub use id::Id;
pub use result::DomainResult;
pub use value_object::ValueObject;
