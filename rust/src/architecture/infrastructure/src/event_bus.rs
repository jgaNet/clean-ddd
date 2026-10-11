//! A process-local bus: a map from a channel — an event's name — to the handlers subscribed to
//! it. Publishing builds a pending operation and hands it to each handler in turn, awaited, so
//! what comes back is the operation as the handlers left it; an event nobody listens to stays
//! pending. The Tracker context's decorator will record those operations.
//!
//! Handlers run inline, on the publisher's task. A transport that wants to answer before the
//! handling is done spawns the publication on its runtime; the bus does not know the runtime.

use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use architecture_application::{AnyEvent, AnyHandler, BoxFuture, EventBus, ExecutionContext, Operation};

#[derive(Default)]
pub struct InMemoryEventBus {
    handlers: RwLock<HashMap<&'static str, Vec<Arc<dyn AnyHandler>>>>,
}

impl InMemoryEventBus {
    pub fn new() -> Self {
        Self::default()
    }

    fn handlers_of(&self, channel: &str) -> Vec<Arc<dyn AnyHandler>> {
        self.handlers.read().unwrap_or_else(|poisoned| poisoned.into_inner()).get(channel).cloned().unwrap_or_default()
    }
}

impl EventBus for InMemoryEventBus {
    /// Nothing to connect to: the bus is in this process.
    fn connect(&self) -> BoxFuture<'_, ()> {
        Box::pin(async {})
    }

    fn publish(&self, event: Arc<dyn AnyEvent>, context: ExecutionContext) -> BoxFuture<'_, Operation> {
        Box::pin(async move {
            let handlers = self.handlers_of(event.name());
            let mut operation = Operation::new(event, context);
            for handler in handlers {
                operation = handler.handle(operation).await;
            }
            operation
        })
    }

    fn subscribe(&self, channel: &'static str, handler: Arc<dyn AnyHandler>) -> BoxFuture<'_, ()> {
        self.handlers
            .write()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .entry(channel)
            .or_default()
            .push(handler);
        Box::pin(async {})
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use architecture_application::{Auth, EventHandler, EventSubscriber, ExecutionContextOptions, OperationStatus};
    use architecture_domain::{DomainEvent, DomainResult, Event};

    use super::*;

    #[derive(Debug, Clone, PartialEq)]
    enum Greeting {
        Greeted { name: String },
        Waved,
    }
    impl Event for Greeting {
        fn name(&self) -> &'static str {
            match self {
                Greeting::Greeted { .. } => "Greeted",
                Greeting::Waved => "Waved",
            }
        }
    }
    impl DomainEvent for Greeting {}

    #[derive(Default)]
    struct Recorder(Mutex<Vec<Greeting>>);
    impl EventHandler for Recorder {
        type Event = Greeting;
        async fn execute(&self, event: Greeting, _: &ExecutionContext) -> DomainResult {
            self.0.lock().unwrap().push(event);
            Ok(())
        }
    }

    #[test]
    fn routes_an_event_to_the_handlers_of_its_name_and_answers_with_the_operation_they_left() {
        let bus = Arc::new(InMemoryEventBus::new());
        let recorder = Arc::new(EventSubscriber(Recorder::default()));
        pollster::block_on(bus.subscribe("Greeted", recorder.clone()));
        let context = ExecutionContext::new(ExecutionContextOptions {
            trace_id: "trace".into(),
            auth: Auth::anonymous(),
            event_bus: bus.clone(),
            unit_of_work: None,
            logger: None,
        });

        let greeted = pollster::block_on(context.publish(Greeting::Greeted { name: "alice".into() }));
        let waved = pollster::block_on(context.publish(Greeting::Waved));

        assert_eq!(greeted.status(), OperationStatus::Sent);
        assert_eq!(waved.status(), OperationStatus::Pending); // nobody listens on that channel
        assert_eq!(*recorder.0.0.lock().unwrap(), [Greeting::Greeted { name: "alice".into() }]);
    }
}
