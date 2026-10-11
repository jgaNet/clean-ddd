//! The shared kernel's Application: the one authorization question every context asks first,
//! and the integration events that are the published contracts between contexts.

pub mod guards;
pub mod integration_events;

pub use guards::require_signed_in;
