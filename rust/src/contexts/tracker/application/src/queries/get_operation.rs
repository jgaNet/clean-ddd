//! One operation, by id. A user may follow their own operations; an administrator may follow any.
//! An operation nobody started — an anonymous command, a sign-up — is followed by whoever holds
//! its id: the id is unguessable and is only ever given to the caller who started it, in the 202
//! (ADR 27).

use std::sync::Arc;

use architecture_application::{ExecutionContext, Query, QueryHandler};
use architecture_domain::{DomainResult, Exception};
use shared_kernel_application::require_signed_in;
use shared_kernel_domain::Role;

use crate::SERVICE;
use crate::ports::OperationRecords;
use crate::read_model::OperationRecord;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GetOperation {
    pub id: String,
}

impl Query for GetOperation {
    type Output = OperationRecord;
}

pub struct GetOperationQueryHandler<R> {
    records: Arc<R>,
}

impl<R> GetOperationQueryHandler<R> {
    pub fn new(records: Arc<R>) -> Self {
        Self { records }
    }
}

impl<R: OperationRecords + Send + Sync + 'static> QueryHandler for GetOperationQueryHandler<R> {
    type Query = GetOperation;

    async fn execute(
        &self,
        GetOperation { id }: GetOperation,
        context: &ExecutionContext,
    ) -> DomainResult<OperationRecord> {
        let record = self.records.find_by_id(&id).await;
        if let Some(record) = &record
            && record.subject_id.as_deref().is_none_or(str::is_empty)
        {
            return Ok(record.clone());
        }

        let reader = require_signed_in(context, SERVICE)?;
        let is_admin = context.auth().role.as_deref() == Some(Role::Admin.as_str());

        // An operation someone else started does not exist, as far as you know.
        let visible = record.filter(|record| is_admin || record.subject_id.as_deref() == Some(reader.value()));

        visible.ok_or_else(|| Exception::not_found(SERVICE, "Operation not found").with("id", id))
    }
}
