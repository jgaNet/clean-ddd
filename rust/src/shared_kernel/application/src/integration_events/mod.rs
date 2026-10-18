//! The published contracts between contexts: named, versionable payloads, one file per subject.
//! Both sides see the same file, so changing one is a visible, reviewable change to a contract
//! (ADR 6). A contract appears when a first consumer needs a fact; adding one is a feature's
//! business, not an architecture change.

pub mod account_integration_events;
pub mod note_integration_events;
pub mod tracker_integration_events;
