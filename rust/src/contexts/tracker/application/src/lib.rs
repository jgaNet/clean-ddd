//! The Application layer of the Tracker context. Tracker has no aggregate: it is a projection.
//! Every operation the event bus carries is recorded as an [`OperationRecord`], so a client that
//! received `202 { operationId }` can come back and ask how it went.
//!
//! [`OperationRecord`]: read_model::OperationRecord

pub mod ports;
pub mod projection;
pub mod queries;
pub mod read_model;

/// The context that refuses, named in every guard and exception.
pub const SERVICE: &str = "Tracker";
