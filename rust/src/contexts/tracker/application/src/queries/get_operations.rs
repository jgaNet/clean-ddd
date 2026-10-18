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

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use architecture_application::{Auth, ExecutionContextOptions};
    use architecture_domain::common_exceptions::{NOT_ALLOWED, NOT_FOUND};
    use architecture_infrastructure::InMemoryEventBus;
    use chrono::Utc;

    use super::super::get_operation::{GetOperation, GetOperationQueryHandler};
    use super::*;

    /// The port, as a list: an Application test needs no adapter for a read model.
    struct Records(Mutex<Vec<OperationRecord>>);
    impl OperationRecords for Records {
        async fn save(&self, record: OperationRecord) {
            self.0.lock().unwrap().push(record);
        }
        async fn find_by_id(&self, id: &str) -> Option<OperationRecord> {
            self.0.lock().unwrap().iter().find(|record| record.id == id).cloned()
        }
        async fn find_all(&self) -> Vec<OperationRecord> {
            self.0.lock().unwrap().clone()
        }
        async fn find_by_trace_id(&self, trace_id: &str) -> Vec<OperationRecord> {
            self.0.lock().unwrap().iter().filter(|record| record.trace_id == trace_id).cloned().collect()
        }
    }

    fn context_for(subject_id: &str, role: Role) -> ExecutionContext {
        ExecutionContext::new(ExecutionContextOptions {
            trace_id: "trace".into(),
            auth: Auth::of(subject_id, role.as_str()),
            event_bus: Arc::new(InMemoryEventBus::new()),
            unit_of_work: None,
            logger: None,
        })
    }

    fn a_record(id: &str, subject_id: &str, trace_id: &str) -> OperationRecord {
        OperationRecord {
            id: id.into(),
            name: "CreateNote".into(),
            status: "SUCCESS".into(),
            trace_id: trace_id.into(),
            subject_id: Some(subject_id.into()),
            result: None,
            error: None,
            created_at: Utc::now(),
            finished_at: None,
        }
    }

    fn records() -> Arc<Records> {
        Arc::new(Records(Mutex::new(vec![a_record("op-1", "alice", "t1"), a_record("op-2", "bob", "t2")])))
    }

    #[test]
    fn shows_an_operation_to_whoever_asked_for_it_and_to_an_administrator_only() {
        let handler = GetOperationQueryHandler::new(records());

        let own =
            pollster::block_on(handler.handle(GetOperation { id: "op-1".into() }, &context_for("alice", Role::User)));
        let any =
            pollster::block_on(handler.handle(GetOperation { id: "op-1".into() }, &context_for("root", Role::Admin)));
        let other =
            pollster::block_on(handler.handle(GetOperation { id: "op-2".into() }, &context_for("alice", Role::User)));

        assert_eq!(own.expect("own").id, "op-1");
        assert_eq!(any.expect("admin").id, "op-1");
        assert!(other.expect_err("someone else's").is(NOT_FOUND));
    }

    #[test]
    fn lists_operations_for_an_administrator_by_trace_when_asked() {
        let handler = GetOperationsQueryHandler::new(records());

        let all = pollster::block_on(handler.handle(GetOperations::default(), &context_for("root", Role::Admin)));
        let by_trace = pollster::block_on(
            handler.handle(GetOperations { trace_id: Some("t2".into()) }, &context_for("root", Role::Admin)),
        );
        let refused = pollster::block_on(handler.handle(GetOperations::default(), &context_for("alice", Role::User)));

        assert_eq!(all.expect("all").len(), 2);
        assert_eq!(by_trace.expect("by trace").iter().map(|r| r.id.as_str()).collect::<Vec<_>>(), ["op-2"]);
        assert!(refused.expect_err("users may not list").is(NOT_ALLOWED));
    }
}
