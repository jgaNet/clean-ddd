//! The projection itself: from what the bus knows about an operation to what a client may see.
//! It keeps the trace and the caller, drops the execution context (logger, bus, unit of work
//! have no place in a read model) and the payload (it may carry a secret), and flattens the
//! result into `result` / `error`.

use architecture_application::Operation;
use architecture_domain::public_name;
use chrono::{DateTime, Utc};

use crate::read_model::{OperationError, OperationRecord};

pub fn to_operation_record(operation: &Operation) -> OperationRecord {
    OperationRecord {
        id: operation.id().to_string(),
        name: public_name(operation.event().name()).to_string(),
        status: operation.status().as_str().to_string(),
        trace_id: operation.context().trace_id().to_string(),
        subject_id: operation.context().auth().subject_id.clone(),
        result: operation.value_as_json(),
        error: operation
            .error()
            .map(|error| OperationError { kind: error.kind().to_string(), message: error.message().to_string() }),
        created_at: DateTime::<Utc>::from(operation.created_at()),
        finished_at: operation.finished_at().map(DateTime::<Utc>::from),
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use architecture_application::{Auth, ExecutionContext, ExecutionContextOptions};
    use architecture_domain::{Event, EventKind, Exception};
    use architecture_infrastructure::InMemoryEventBus;

    use super::*;

    #[derive(Debug, Clone, PartialEq)]
    struct Greet {
        secret: String,
    }
    impl Event for Greet {
        fn name(&self) -> &'static str {
            "Greet"
        }
        fn kind(&self) -> EventKind {
            EventKind::Command
        }
    }

    fn an_operation(subject: Option<&str>) -> Operation {
        let auth = subject.map(|id| Auth::of(id, "USER")).unwrap_or_default();
        let context = ExecutionContext::new(ExecutionContextOptions {
            trace_id: "trace-1".into(),
            auth,
            event_bus: Arc::new(InMemoryEventBus::new()),
            unit_of_work: None,
            logger: None,
        });
        Operation::new(Arc::new(Greet { secret: "hunter2".into() }), context)
    }

    #[test]
    fn keeps_the_trace_and_the_caller_and_drops_the_payload_and_the_context() {
        let record = to_operation_record(&an_operation(Some("alice")));

        assert_eq!(record.name, "Greet");
        assert_eq!(record.status, "PENDING");
        assert_eq!(record.trace_id, "trace-1");
        assert_eq!(record.subject_id.as_deref(), Some("alice"));
        assert_eq!(record.result, None);
        assert_eq!(record.finished_at, None);
        assert!(!serde_json::to_string(&record).expect("JSON").contains("hunter2"));
    }

    #[test]
    fn flattens_the_outcome_into_result_or_error() {
        let success = to_operation_record(&an_operation(None).success(Arc::new("note-1".to_string())));
        let failed = to_operation_record(&an_operation(None).failed(Exception::not_found("Notes", "Note not found")));

        assert_eq!(success.status, "SUCCESS");
        assert_eq!(success.result, Some(serde_json::json!("note-1")));
        assert!(success.finished_at.is_some());
        assert_eq!(success.subject_id, None);
        assert_eq!(failed.status, "ERROR");
        assert_eq!(failed.error, Some(OperationError { kind: "NotFound".into(), message: "Note not found".into() }));
        assert_eq!(serde_json::to_value(&failed).expect("JSON")["error"]["type"], "NotFound");
    }
}
