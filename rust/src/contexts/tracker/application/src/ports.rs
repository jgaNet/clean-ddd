//! The store of the projection. Unlike an aggregate repository it is written by the projection
//! and read by the queries through the same port: a read model has no invariants to protect,
//! so there is nothing to gain from splitting it. The Application owns it, since the context
//! has no Domain.

use std::future::Future;

use crate::read_model::OperationRecord;

pub trait OperationRecords {
    /// Stores or replaces the record of that operation id.
    fn save(&self, record: OperationRecord) -> impl Future<Output = ()> + Send;
    fn find_by_id(&self, id: &str) -> impl Future<Output = Option<OperationRecord>> + Send;
    /// In the order they were first recorded.
    fn find_all(&self) -> impl Future<Output = Vec<OperationRecord>> + Send;
    /// In the order they were first recorded.
    fn find_by_trace_id(&self, trace_id: &str) -> impl Future<Output = Vec<OperationRecord>> + Send;
}
