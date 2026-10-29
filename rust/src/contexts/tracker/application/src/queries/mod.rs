//! The queries of the Tracker context: one operation, or the list an administrator sees.

pub mod get_operation;
pub mod get_operations;

/// Who may see what: the visibility of one operation and the administrator's list, over the
/// port as a list.
#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use architecture_application::{Auth, ExecutionContext, ExecutionContextOptions, QueryHandler};
    use architecture_domain::DomainResult;
    use architecture_domain::common_exceptions::{NOT_ALLOWED, NOT_FOUND};
    use architecture_infrastructure::InMemoryEventBus;
    use chrono::Utc;
    use shared_kernel_domain::Role;

    use super::get_operation::{GetOperation, GetOperationQueryHandler};
    use super::get_operations::{GetOperations, GetOperationsQueryHandler};
    use crate::ports::OperationRecords;
    use crate::read_model::OperationRecord;

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

    fn context_with(auth: Auth) -> ExecutionContext {
        ExecutionContext::new(ExecutionContextOptions {
            trace_id: "trace".into(),
            auth,
            event_bus: Arc::new(InMemoryEventBus::new()),
            unit_of_work: None,
            logger: None,
        })
    }

    fn context_for(subject_id: &str, role: Role) -> ExecutionContext {
        context_with(Auth::of(subject_id, role.as_str()))
    }

    fn anonymous() -> ExecutionContext {
        context_with(Auth::anonymous())
    }

    /// An operation `subject_id` started, or nobody when `None` (an anonymous command: a sign-up).
    fn a_record(id: &str, subject_id: Option<&str>, trace_id: &str) -> OperationRecord {
        OperationRecord {
            id: id.into(),
            name: "CreateNote".into(),
            status: "SUCCESS".into(),
            trace_id: trace_id.into(),
            subject_id: subject_id.map(String::from),
            result: None,
            error: None,
            created_at: Utc::now(),
            finished_at: None,
        }
    }

    fn records() -> Arc<Records> {
        Arc::new(Records(Mutex::new(vec![
            a_record("op-1", Some("alice"), "t1"),
            a_record("op-2", Some("bob"), "t2"),
            a_record("nobody", None, "t3"),
        ])))
    }

    fn get(id: &str, context: &ExecutionContext) -> DomainResult<OperationRecord> {
        pollster::block_on(GetOperationQueryHandler::new(records()).handle(GetOperation { id: id.into() }, context))
    }

    #[test]
    fn shows_an_operation_nobody_started_to_whoever_holds_its_id_signed_in_or_not() {
        for context in [anonymous(), context_for("bob", Role::User)] {
            assert_eq!(get("nobody", &context).expect("nobody's").id, "nobody");
        }
    }

    #[test]
    fn shows_an_operation_an_account_started_to_that_account_and_to_an_administrator() {
        for context in [context_for("alice", Role::User), context_for("root", Role::Admin)] {
            assert_eq!(get("op-1", &context).expect("alice's").id, "op-1");
        }
    }

    #[test]
    fn asks_an_anonymous_caller_to_sign_in_for_anything_else_known_or_not() {
        for id in ["op-1", "unknown"] {
            assert!(get(id, &anonymous()).expect_err("anonymous").is(NOT_ALLOWED));
        }
    }

    #[test]
    fn tells_another_account_that_an_operation_it_did_not_start_does_not_exist() {
        for id in ["op-1", "unknown"] {
            assert!(get(id, &context_for("bob", Role::User)).expect_err("someone else's").is(NOT_FOUND));
        }
    }

    #[test]
    fn lists_operations_for_an_administrator_by_trace_when_asked() {
        let handler = GetOperationsQueryHandler::new(records());

        let all = pollster::block_on(handler.handle(GetOperations::default(), &context_for("root", Role::Admin)));
        let by_trace = pollster::block_on(
            handler.handle(GetOperations { trace_id: Some("t2".into()) }, &context_for("root", Role::Admin)),
        );
        let refused = pollster::block_on(handler.handle(GetOperations::default(), &context_for("alice", Role::User)));

        assert_eq!(all.expect("all").len(), 3);
        assert_eq!(by_trace.expect("by trace").iter().map(|r| r.id.as_str()).collect::<Vec<_>>(), ["op-2"]);
        assert!(refused.expect_err("users may not list").is(NOT_ALLOWED));
    }
}
