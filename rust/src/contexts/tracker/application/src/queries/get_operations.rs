//! Every operation, or those of one trace: an administrator's view, so the rule is in `guard()`.

use std::sync::Arc;

use architecture_application::{ExecutionContext, Query, QueryHandler};
use architecture_domain::{DomainResult, Exception};
use shared_kernel_domain::Role;

use crate::SERVICE;
use crate::ports::OperationRecords;
use crate::read_model::OperationRecord;

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct GetOperations {
    pub trace_id: Option<String>,
}

impl Query for GetOperations {
    type Output = Vec<OperationRecord>;
}

pub struct GetOperationsQueryHandler<R> {
    records: Arc<R>,
}

impl<R> GetOperationsQueryHandler<R> {
    pub fn new(records: Arc<R>) -> Self {
        Self { records }
    }
}

impl<R: OperationRecords + Send + Sync + 'static> QueryHandler for GetOperationsQueryHandler<R> {
    type Query = GetOperations;

    async fn guard(&self, _: &GetOperations, context: &ExecutionContext) -> DomainResult {
        if context.auth().role.as_deref() != Some(Role::Admin.as_str()) {
            return Err(Exception::not_allowed(SERVICE, "Only an administrator can list operations"));
        }
        Ok(())
    }

    async fn execute(&self, query: GetOperations, _: &ExecutionContext) -> DomainResult<Vec<OperationRecord>> {
        Ok(match query.trace_id {
            Some(trace_id) => self.records.find_by_trace_id(&trace_id).await,
            None => self.records.find_all().await,
        })
    }
}
