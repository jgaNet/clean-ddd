//! `EventHandler`: reacts to an event. It is the shape of every listener in the application
//! layer.
//!
//! A domain event handler stays inside its context and typically logs, updates a read model or
//! publishes an integration event for other contexts (the Notes context's `NoteSharedHandler`).
//! An integration event handler lives in the receiving context and translates the foreign event
//! into a local command or service call.
//!
//! A reaction is awaited and its outcome recorded on the operation (`Sent`, or `Error` with the
//! failure), so a listener that fails is visible in the trace instead of vanishing. It cannot
//! undo the fact it reacted to: the event was published after the commit (ADR 3), and a failed
//! reaction is the listener's problem to retry or report, never the publisher's.

use std::any::{Any, type_name};
use std::future::Future;
use std::panic::AssertUnwindSafe;

use futures::FutureExt;

use architecture_domain::{DomainResult, Event, Exception};

use crate::BoxFuture;
use crate::event_bus::AnyHandler;
use crate::execution_context::{ExecutionContext, panic_message};
use crate::operation::Operation;

pub trait EventHandler: Send + Sync + 'static {
    type Event: Event + Send + Sync + 'static;

    /// The reaction. Implement it in each concrete handler.
    fn execute(&self, event: Self::Event, context: &ExecutionContext) -> impl Future<Output = DomainResult> + Send;

    /// What the bus calls: the reaction, awaited, its outcome on the operation. Not meant to be overridden.
    fn handle(&self, operation: Operation) -> impl Future<Output = Operation> + Send {
        async move {
            let name = operation.event().name();
            let Some(event) = operation.event_as::<Self::Event>().cloned() else {
                return operation.failed(Exception::unknown(format!(
                    "{} received an event it does not handle: {}",
                    type_name::<Self>(),
                    name
                )));
            };
            let context = operation.context().clone();
            let handler = type_name::<Self>();

            match AssertUnwindSafe(self.execute(event, &context)).catch_unwind().await {
                Ok(Ok(())) => operation.sent(),
                Ok(Err(failure)) => {
                    if let Some(logger) = context.logger() {
                        logger.warn(context.trace_id(), &format!("{handler} failed on {name}: {}", failure.message()));
                    }
                    operation.failed(failure)
                }
                Err(payload) => {
                    let message = panic_message(payload.as_ref());
                    if let Some(logger) = context.logger() {
                        logger.error(context.trace_id(), &format!("Unexpected error in {handler} on {name}"), &message);
                    }
                    operation.failed(Exception::unknown(message))
                }
            }
        }
    }
}

/// An event handler as the bus holds it: the one place the type-erased operation meets the typed handler.
pub struct EventSubscriber<H: EventHandler>(pub H);

impl<H: EventHandler> AnyHandler for EventSubscriber<H> {
    fn handle(&self, operation: Operation) -> BoxFuture<'_, Operation> {
        Box::pin(self.0.handle(operation))
    }

    fn as_any(&self) -> &dyn Any {
        self
    }
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use architecture_domain::DomainEvent;

    use super::*;
    use crate::event_bus::{AnyEvent, EventBus};
    use crate::execution_context::{Auth, ExecutionContextOptions};
    use crate::operation::OperationStatus;

    #[derive(Debug, Clone, PartialEq)]
    struct Greeted {
        then: Option<&'static str>,
    }
    impl Event for Greeted {
        fn name(&self) -> &'static str {
            "Greeted"
        }
    }
    impl DomainEvent for Greeted {}

    #[derive(Default)]
    struct OnGreeted {
        reacted: Mutex<bool>,
    }
    impl EventHandler for OnGreeted {
        type Event = Greeted;
        async fn execute(&self, event: Greeted, _context: &ExecutionContext) -> DomainResult {
            match event.then {
                Some("throw") => panic!("boom"),
                Some("fail") => Err(Exception::not_found("Test", "Nothing to react to")),
                _ => {
                    *self.reacted.lock().unwrap() = true;
                    Ok(())
                }
            }
        }
    }

    struct NoBus;
    impl EventBus for NoBus {
        fn connect(&self) -> BoxFuture<'_, ()> {
            Box::pin(async {})
        }
        fn publish(&self, _event: Arc<dyn AnyEvent>, _context: ExecutionContext) -> BoxFuture<'_, Operation> {
            unreachable!("not used")
        }
        fn subscribe(&self, _channel: &'static str, _handler: Arc<dyn AnyHandler>) -> BoxFuture<'_, ()> {
            Box::pin(async {})
        }
    }

    fn operation_for(then: Option<&'static str>) -> Operation {
        let context = ExecutionContext::new(ExecutionContextOptions {
            trace_id: "trace".into(),
            auth: Auth::anonymous(),
            event_bus: Arc::new(NoBus),
            unit_of_work: None,
            logger: None,
        });
        Operation::new(Arc::new(Greeted { then }), context)
    }

    #[test]
    fn awaits_the_reaction_and_marks_the_operation_sent() {
        let handler = OnGreeted::default();

        let done = pollster::block_on(handler.handle(operation_for(None)));

        assert!(*handler.reacted.lock().unwrap()); // not fire-and-forget: the reaction ran before handle() resolved
        assert_eq!(done.status(), OperationStatus::Sent);
    }

    #[test]
    fn records_a_failed_reaction_on_the_operation() {
        let done = pollster::block_on(OnGreeted::default().handle(operation_for(Some("fail"))));

        assert_eq!(done.status(), OperationStatus::Error);
        assert_eq!(done.error().expect("failed").message(), "Nothing to react to");
    }

    #[test]
    fn turns_a_panic_into_a_failed_operation_instead_of_a_crash() {
        let done = pollster::block_on(OnGreeted::default().handle(operation_for(Some("throw"))));

        assert_eq!(done.status(), OperationStatus::Error);
        assert_eq!(done.error().expect("failed").message(), "boom");
    }
}
