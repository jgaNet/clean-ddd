//! The building blocks' Presentation: the two ways a controller answers, and nothing a context
//! would call vocabulary.
//!
//! - A command is **accepted**: the controller builds the command, and [`accept`] answers
//!   `202 { operationId }` at once and spawns the dispatch on the runtime. The client follows the
//!   operation through the Tracker. The bus does not know the runtime (ADR 13); this crate is
//!   where the runtime appears, and it appears nowhere below (ADR 14). [`accept`] is also where
//!   who reaches a command is decided (API-CALLER-AT-TRANSPORT, ADR 39): a caller who is not
//!   signed in is refused at once with `401` ([`NotSignedIn`]), before anything is published,
//!   unless the command's handler says anyone may ask for it. It is the one way a route publishes
//!   a command: the conventions check refuses a context's presentation crate that dispatches or
//!   answers `202` by itself.
//! - A query answers synchronously, and a refused one is a **refusal**: the exception's `kind`
//!   decides the status ([`status_of`]: not allowed 401 to a caller who is not signed in and 403
//!   to a signed-in one, not found 404, anything else 400) and the body carries its message
//!   ([`refused`]). A context maps its own kinds first (a `NoteNotFound` is a 404) and falls back
//!   on this.
//!
//! - A use case may answer in **several formats**: JSON for API clients, HTML fragments for the
//!   HTMX front end. [`format_of`] reads which one a request wants, and a controller keeps one
//!   [`Presenter`] per format in a [`ByFormat`] — JSON mandatory, HTMX optional, falling back on
//!   JSON — a plain value the controller owns, nothing registered or looked up by name.
//!
//! The per-request [`ExecutionContext`] reaches a controller as an axum `Extension`, which the
//! composition root inserts: a controller never builds one, never builds an adapter, and gets
//! its `Module` from the state the composition root passes (ARCH-PRESENTATION).

pub mod format;

use std::sync::Arc;

use architecture_application::{AnyEvent, ExecutionContext, Module, Operation};
use architecture_domain::common_exceptions::{NOT_ALLOWED, NOT_FOUND};
use architecture_domain::{CommandEvent, Exception};
use axum::Json;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde::Serialize;

pub use format::{ByFormat, Format, Presenter, format_of};

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

/// `401 { message }`: nobody is signed in, and the command needs a caller (API-CALLER-AT-TRANSPORT).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct NotSignedIn;

/// The body of a `401`, the same on every route.
pub const AUTHENTICATION_REQUIRED: &str = "Authentication required";

impl IntoResponse for NotSignedIn {
    fn into_response(self) -> Response {
        (StatusCode::UNAUTHORIZED, Json(Refusal { message: AUTHENTICATION_REQUIRED.to_string() })).into_response()
    }
}

/// Accepts a command: the operation exists, its id is answered, and its dispatch runs on the
/// runtime, with this request's context, after the response has left. What every route whose
/// command's outcome is read later does, and the only way it publishes one; the handling itself
/// is the handlers' business.
///
/// Who reaches the command is decided here, at once (API-CALLER-AT-TRANSPORT, ADR 39): when
/// nobody is signed in and the handler the module lists for the command does not say anyone may
/// ask for it (`anyone_may_ask()`), the answer is [`NotSignedIn`] and nothing is published. The
/// client learns at once that it must sign in, instead of following an operation that was never
/// going to succeed. What a signed-in caller may do is not decided here: the handler still asks
/// for its caller's id, and the aggregate refuses what that caller may not do, on the operation.
/// A command answered at once (a login) does not come through here and keeps its own refusal.
///
/// ```ignore
/// async fn archive_note(State(module): State<Arc<Module>>, Extension(context): Extension<ExecutionContext>, Path(id): Path<String>) -> Response {
///     accept(&context, &module, ArchiveNote { note_id: id }).into_response()
/// }
/// ```
///
/// # Panics
///
/// When the module lists no handler for the command: a wiring mistake, not a refusal.
pub fn accept<C: CommandEvent + Send + Sync + 'static>(
    context: &ExecutionContext,
    module: &Module,
    command: C,
) -> Result<Accepted, NotSignedIn> {
    if !signed_in(context) && !module.command::<C>().anyone_may_ask(&command) {
        return Err(NotSignedIn);
    }
    let event: Arc<dyn AnyEvent> = Arc::new(command);
    let operation = Operation::new(event, context.clone());
    let operation_id = operation.id().to_string();
    let bus = context.event_bus().clone();
    tokio::spawn(async move {
        bus.dispatch(operation).await;
    });
    Ok(Accepted { operation_id })
}

/// `{ message }`: what a refused request answers with, whatever the status.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Refusal {
    pub message: String,
}

/// The status a refusal's kind deserves when the context has no more specific answer: a refusal
/// of who is calling is [`not_allowed_status`], a thing not found `404`, anything else `400`.
pub fn status_of(error: &Exception, context: &ExecutionContext) -> StatusCode {
    if error.is(NOT_ALLOWED) {
        not_allowed_status(context)
    } else if error.is(NOT_FOUND) {
        StatusCode::NOT_FOUND
    } else {
        StatusCode::BAD_REQUEST
    }
}

/// The status of a refusal a query answers at once (`NOT_ALLOWED`): `401` to a caller who is not
/// signed in, as HTTP says for missing credentials, `403` to a signed-in caller the rule refuses.
/// One refusal has one status, for a command and a query alike (API-CALLER-AT-TRANSPORT).
pub fn not_allowed_status(context: &ExecutionContext) -> StatusCode {
    if signed_in(context) { StatusCode::FORBIDDEN } else { StatusCode::UNAUTHORIZED }
}

fn signed_in(context: &ExecutionContext) -> bool {
    context.auth().subject_id.as_deref().is_some_and(|id| !id.is_empty())
}

/// A refusal as a response: the status given, the exception's message as the body.
pub fn refused(status: StatusCode, error: &Exception) -> Response {
    (status, Json(Refusal { message: error.message().to_string() })).into_response()
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use architecture_application::{
        AnyHandler, Auth, BoxFuture, CommandHandler, EventBus, ExecutionContextOptions, ModuleDefinition, Subscription,
    };
    use architecture_domain::{DomainResult, Event, EventKind};
    use axum::body::to_bytes;

    use super::*;

    /// A command anyone may ask for when it carries its own proof, and only then.
    #[derive(Debug, Clone, PartialEq)]
    struct Greet {
        proof: Option<&'static str>,
    }
    impl Event for Greet {
        fn name(&self) -> &'static str {
            Self::NAME
        }
        fn kind(&self) -> EventKind {
            EventKind::Command
        }
    }
    impl CommandEvent for Greet {
        const NAME: &'static str = "Greet";
        type Output = ();
    }
    struct GreetHandler;
    impl CommandHandler for GreetHandler {
        type Command = Greet;
        fn anyone_may_ask(&self, command: &Greet) -> bool {
            command.proof.is_some()
        }
        async fn execute(&self, _: Greet, _: &ExecutionContext) -> DomainResult {
            Ok(())
        }
    }

    /// A command no handler of the module answers.
    #[derive(Debug, Clone, PartialEq)]
    struct Wave;
    impl Event for Wave {
        fn name(&self) -> &'static str {
            Self::NAME
        }
        fn kind(&self) -> EventKind {
            EventKind::Command
        }
    }
    impl CommandEvent for Wave {
        const NAME: &'static str = "Wave";
        type Output = ();
    }

    fn module() -> Module {
        Module::new(ModuleDefinition {
            name: "Greetings",
            commands: vec![Subscription::command(GreetHandler)],
            queries: vec![],
            domain_events: vec![],
            integration_events: vec![],
        })
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

    fn context_of(bus: &Arc<Dispatched>, auth: Auth) -> ExecutionContext {
        ExecutionContext::new(ExecutionContextOptions {
            trace_id: "trace".into(),
            auth,
            event_bus: bus.clone(),
            unit_of_work: None,
            logger: None,
        })
    }

    fn dispatched(bus: &Dispatched) -> Vec<String> {
        bus.0.lock().unwrap().clone()
    }

    async fn body_of(response: Response) -> (StatusCode, serde_json::Value) {
        let status = response.status();
        let bytes = to_bytes(response.into_body(), usize::MAX).await.expect("a body");
        (status, serde_json::from_slice(&bytes).expect("JSON"))
    }

    #[tokio::test]
    async fn accepts_the_command_of_a_signed_in_caller_with_its_operation_id_and_dispatches_it_after_answering() {
        let bus = Arc::new(Dispatched::default());
        let context = context_of(&bus, Auth::of("alice", "USER"));

        let accepted = accept(&context, &module(), Greet { proof: None }).expect("accepted");
        let (status, body) = body_of(accepted.clone().into_response()).await;

        assert_eq!(status, StatusCode::ACCEPTED);
        assert_eq!(body, serde_json::json!({ "operationId": accepted.operation_id }));
        // The dispatch runs on the runtime, after the answer; yielding lets it run here.
        tokio::task::yield_now().await;
        assert_eq!(dispatched(&bus), [accepted.operation_id]);
    }

    #[tokio::test]
    async fn refuses_a_caller_who_is_not_signed_in_with_401_and_publishes_nothing() {
        let bus = Arc::new(Dispatched::default());
        let context = context_of(&bus, Auth::anonymous());

        let refused = accept(&context, &module(), Greet { proof: None });
        let (status, body) = body_of(refused.into_response()).await;

        assert_eq!(status, StatusCode::UNAUTHORIZED);
        assert_eq!(body, serde_json::json!({ "message": AUTHENTICATION_REQUIRED }));
        tokio::task::yield_now().await;
        assert!(dispatched(&bus).is_empty());
    }

    #[tokio::test]
    async fn lets_anyone_ask_for_a_command_whose_handler_says_so_and_only_for_what_it_says() {
        let bus = Arc::new(Dispatched::default());
        let context = context_of(&bus, Auth::anonymous());

        let accepted = accept(&context, &module(), Greet { proof: Some("token") }).expect("anyone may ask");
        assert_eq!(accept(&context, &module(), Greet { proof: None }), Err(NotSignedIn));

        tokio::task::yield_now().await;
        assert_eq!(dispatched(&bus), [accepted.operation_id]);
    }

    #[test]
    #[should_panic(expected = "Missing command handler for Wave in module Greetings")]
    fn treats_a_command_no_handler_of_the_module_answers_as_a_wiring_error() {
        let bus = Arc::new(Dispatched::default());
        let _ = accept(&context_of(&bus, Auth::anonymous()), &module(), Wave);
    }

    #[tokio::test]
    async fn answers_a_refusal_with_the_status_of_its_kind_and_its_message() {
        let bus = Arc::new(Dispatched::default());
        let signed_in = context_of(&bus, Auth::of("alice", "USER"));
        let anonymous = context_of(&bus, Auth::anonymous());
        let not_allowed = Exception::not_allowed("Test", "Sign in first");
        let not_found = Exception::not_found("Test", "No such thing");
        let other = Exception::new("Test", "TitleTooLong", "Too long");

        // A refusal of who is calling: 401 to a caller who is not signed in, 403 to one who is.
        assert_eq!(status_of(&not_allowed, &anonymous), StatusCode::UNAUTHORIZED);
        assert_eq!(status_of(&not_allowed, &signed_in), StatusCode::FORBIDDEN);
        assert_eq!(status_of(&not_found, &signed_in), StatusCode::NOT_FOUND);
        assert_eq!(status_of(&other, &signed_in), StatusCode::BAD_REQUEST);
        let (status, body) = body_of(refused(status_of(&not_found, &anonymous), &not_found)).await;
        assert_eq!(status, StatusCode::NOT_FOUND);
        assert_eq!(body, serde_json::json!({ "message": "No such thing" }));
    }
}
