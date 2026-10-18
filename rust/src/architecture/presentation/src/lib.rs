//! The building blocks' Presentation: the two ways a controller answers, and nothing a context
//! would call vocabulary.
//!
//! - A command is **accepted**: the controller builds the operation, answers `202 { operationId }`
//!   at once and spawns the dispatch on the runtime ([`accept`]). The client follows the
//!   operation through the Tracker. The bus does not know the runtime (ADR 13); this crate is
//!   where the runtime appears, and it appears nowhere below (ADR 14).
//! - A query answers synchronously, and a refused one is a **refusal**: the exception's `kind`
//!   decides the status ([`status_of`]: not allowed 403, not found 404, anything else 400) and the
//!   body carries its message ([`refused`]). A context maps its own kinds first (a `NoteNotFound`
//!   is a 404) and falls back on this.
//!
//! The per-request [`ExecutionContext`] reaches a controller as an axum `Extension`, which the
//! composition root inserts: a controller never builds one, never builds an adapter, and gets
//! its `Module` from the state the composition root passes (ARCH-PRESENTATION).

use std::sync::Arc;

use architecture_application::{AnyEvent, ExecutionContext, Operation};
use architecture_domain::common_exceptions::{NOT_ALLOWED, NOT_FOUND};
use architecture_domain::{Event, Exception};
use axum::Json;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde::Serialize;

/// `202 { operationId }`: the command is being processed; poll the operation to know its outcome.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Accepted {
    pub operation_id: String,
}

impl IntoResponse for Accepted {
    fn into_response(self) -> Response {
        (StatusCode::ACCEPTED, Json(self)).into_response()
    }
}

/// Accepts a command: the operation exists, its id is answered, and its dispatch runs on the
/// runtime, with this request's context, after the response has left. What every command
/// route does; the handling itself is the handlers' business.
pub fn accept<E: Event + Send + Sync + 'static>(context: &ExecutionContext, command: E) -> Accepted {
    let event: Arc<dyn AnyEvent> = Arc::new(command);
    let operation = Operation::new(event, context.clone());
    let operation_id = operation.id().to_string();
    let bus = context.event_bus().clone();
    tokio::spawn(async move {
        bus.dispatch(operation).await;
    });
    Accepted { operation_id }
}

/// `{ message }`: what a refused request answers with, whatever the status.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Refusal {
    pub message: String,
}

/// The status a refusal's kind deserves when the context has no more specific answer.
pub fn status_of(error: &Exception) -> StatusCode {
    if error.is(NOT_ALLOWED) {
        StatusCode::FORBIDDEN
    } else if error.is(NOT_FOUND) {
        StatusCode::NOT_FOUND
    } else {
        StatusCode::BAD_REQUEST
    }
}

/// A refusal as a response: the status given, the exception's message as the body.
pub fn refused(status: StatusCode, error: &Exception) -> Response {
    (status, Json(Refusal { message: error.message().to_string() })).into_response()
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use architecture_application::{AnyHandler, Auth, BoxFuture, EventBus, ExecutionContextOptions};
    use architecture_domain::EventKind;
    use axum::body::to_bytes;

    use super::*;

    #[derive(Debug, Clone, PartialEq)]
    struct Greet;
    impl Event for Greet {
        fn name(&self) -> &'static str {
            "Greet"
        }
        fn kind(&self) -> EventKind {
            EventKind::Command
        }
    }

    /// A bus that only remembers what was dispatched to it: the Presentation's tests need no handler.
    #[derive(Default)]
    struct Dispatched(Mutex<Vec<String>>);
    impl EventBus for Dispatched {
        fn connect(&self) -> BoxFuture<'_, ()> {
            Box::pin(async {})
        }
        fn dispatch(&self, operation: Operation) -> BoxFuture<'_, Operation> {
            self.0.lock().unwrap().push(operation.id().to_string());
            Box::pin(async move { operation })
        }
        fn subscribe(&self, _: &'static str, _: Arc<dyn AnyHandler>) -> BoxFuture<'_, ()> {
            Box::pin(async {})
        }
    }

    async fn body_of(response: Response) -> (StatusCode, serde_json::Value) {
        let status = response.status();
        let bytes = to_bytes(response.into_body(), usize::MAX).await.expect("a body");
        (status, serde_json::from_slice(&bytes).expect("JSON"))
    }

    #[tokio::test]
    async fn accepts_a_command_with_its_operation_id_and_dispatches_it_after_answering() {
        let bus = Arc::new(Dispatched::default());
        let context = ExecutionContext::new(ExecutionContextOptions {
            trace_id: "trace".into(),
            auth: Auth::anonymous(),
            event_bus: bus.clone(),
            unit_of_work: None,
            logger: None,
        });

        let accepted = accept(&context, Greet);
        let (status, body) = body_of(accepted.clone().into_response()).await;

        assert_eq!(status, StatusCode::ACCEPTED);
        assert_eq!(body, serde_json::json!({ "operationId": accepted.operation_id }));
        // The dispatch runs on the runtime, after the answer; yielding lets it run here.
        tokio::task::yield_now().await;
        assert_eq!(*bus.0.lock().unwrap(), [accepted.operation_id]);
    }

    #[tokio::test]
    async fn answers_a_refusal_with_the_status_of_its_kind_and_its_message() {
        let not_allowed = Exception::not_allowed("Test", "Sign in first");
        let not_found = Exception::not_found("Test", "No such thing");
        let other = Exception::new("Test", "TitleTooLong", "Too long");

        assert_eq!(status_of(&not_allowed), StatusCode::FORBIDDEN);
        assert_eq!(status_of(&not_found), StatusCode::NOT_FOUND);
        assert_eq!(status_of(&other), StatusCode::BAD_REQUEST);
        let (status, body) = body_of(refused(status_of(&not_found), &not_found)).await;
        assert_eq!(status, StatusCode::NOT_FOUND);
        assert_eq!(body, serde_json::json!({ "message": "No such thing" }));
    }
}
