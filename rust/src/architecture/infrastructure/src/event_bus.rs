//! A process-local bus: a map from a channel — an event's name — to the handlers subscribed to
//! it. Dispatching hands the pending operation to each handler in turn, awaited, so what comes
//! back is the operation as the handlers left it; an event nobody listens to stays pending.
//! The Tracker context's decorator records those operations.
//!
//! Handlers run inline, on the publisher's task. A transport that wants to answer before the
//! handling is done spawns the publication on its runtime; the bus does not know the runtime.
//!
//! Delivery is idempotent per subscriber (ADR 24): a message relayed from the outbox carries its
//! entry's id as the operation's id, and a subscriber that already handled that id — and did
//! not fail — is not handed it again. The inbox is the bus's, not each handler's, so a reaction
//! stays a plain `execute()`; a reaction that failed is handed the message again, which is what
//! at-least-once is for. The id is claimed when the delivery starts, not when it ends: the
//! handlers run inline, so a relay that meets a message being delivered (a reaction that
//! commits relays in its turn) hands it to nobody twice.

use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex, RwLock};

use architecture_application::{AnyHandler, BoxFuture, EventBus, Operation, OperationStatus};

/// A handler on a channel, with the ids of the messages it handled: its inbox.
struct Subscription {
    handler: Arc<dyn AnyHandler>,
    inbox: Mutex<HashSet<String>>,
}

impl Subscription {
    /// Takes the message for this subscriber; `false` when it already has it.
    fn claim(&self, message_id: &str) -> bool {
        self.inbox.lock().unwrap_or_else(|poisoned| poisoned.into_inner()).insert(message_id.to_string())
    }

    /// Gives the message back: the reaction failed, the next delivery is owed.
    fn release(&self, message_id: &str) {
        self.inbox.lock().unwrap_or_else(|poisoned| poisoned.into_inner()).remove(message_id);
    }
}

#[derive(Default)]
pub struct InMemoryEventBus {
    handlers: RwLock<HashMap<&'static str, Vec<Arc<Subscription>>>>,
}

impl InMemoryEventBus {
    pub fn new() -> Self {
        Self::default()
    }

    fn handlers_of(&self, channel: &str) -> Vec<Arc<Subscription>> {
        self.handlers.read().unwrap_or_else(|poisoned| poisoned.into_inner()).get(channel).cloned().unwrap_or_default()
    }
}

impl EventBus for InMemoryEventBus {
    /// Nothing to connect to: the bus is in this process.
    fn connect(&self) -> BoxFuture<'_, ()> {
        Box::pin(async {})
    }

    fn dispatch(&self, mut operation: Operation) -> BoxFuture<'_, Operation> {
        Box::pin(async move {
            for subscription in self.handlers_of(operation.event().name()) {
                if !subscription.claim(operation.id()) {
                    operation = operation.sent();
                    continue;
                }
                operation = subscription.handler.handle(operation).await;
                if operation.status() == OperationStatus::Error {
                    subscription.release(operation.id());
                }
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
            .push(Arc::new(Subscription { handler, inbox: Mutex::new(HashSet::new()) }));
        Box::pin(async {})
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use architecture_application::{
        Auth, EventHandler, EventSubscriber, ExecutionContext, ExecutionContextOptions, OperationStatus,
    };
    use architecture_domain::{DomainEvent, DomainResult, Event, EventKind, Exception};

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
        fn kind(&self) -> EventKind {
            EventKind::Domain
        }
    }
    impl DomainEvent for Greeting {}

    /// A reaction that records, and fails when told to: the bus's inbox must remember only what was handled.
    #[derive(Default)]
    struct Recorder {
        seen: Mutex<Vec<Greeting>>,
        fail_next: Mutex<bool>,
    }
    impl Recorder {
        fn seen(&self) -> Vec<Greeting> {
            self.seen.lock().unwrap().clone()
        }
    }
    impl EventHandler for Recorder {
        type Event = Greeting;
        async fn execute(&self, event: Greeting, _: &ExecutionContext) -> DomainResult {
            if std::mem::take(&mut *self.fail_next.lock().unwrap()) {
                return Err(Exception::unknown("not this time"));
            }
            self.seen.lock().unwrap().push(event);
            Ok(())
        }
    }

    fn greeted(name: &str) -> Greeting {
        Greeting::Greeted { name: name.into() }
    }

    struct Setup {
        bus: Arc<InMemoryEventBus>,
        recorder: Arc<EventSubscriber<Recorder>>,
        context: ExecutionContext,
    }

    fn setup() -> Setup {
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
        Setup { bus, recorder, context }
    }

    fn publish_as(context: &ExecutionContext, message_id: &str, event: Greeting) -> Operation {
        pollster::block_on(context.publish_with_id(Arc::new(event), message_id.into()))
    }

    #[test]
    fn routes_an_event_to_the_handlers_of_its_name_and_answers_with_the_operation_they_left() {
        let Setup { recorder, context, .. } = setup();

        let handled = pollster::block_on(context.publish(greeted("alice")));
        let waved = pollster::block_on(context.publish(Greeting::Waved));

        assert_eq!(handled.status(), OperationStatus::Sent);
        assert_eq!(waved.status(), OperationStatus::Pending); // nobody listens on that channel
        assert_eq!(recorder.0.seen(), [greeted("alice")]);
    }

    /// Idempotent delivery (ADR 24): a message relayed twice from the outbox reaches a subscriber once.
    #[test]
    fn delivers_a_message_once_per_subscriber_by_its_id_however_many_times_it_is_published() {
        let Setup { recorder, context, .. } = setup();

        publish_as(&context, "message-1", greeted("alice"));
        let again = publish_as(&context, "message-1", greeted("alice"));

        assert_eq!(recorder.0.seen(), [greeted("alice")]);
        assert_eq!(again.status(), OperationStatus::Sent);
    }

    #[test]
    fn delivers_two_messages_with_two_ids_and_the_same_event_without_an_id_as_many_times_as_it_is_published() {
        let Setup { recorder, context, .. } = setup();

        publish_as(&context, "message-1", greeted("alice"));
        publish_as(&context, "message-2", greeted("alice"));
        pollster::block_on(context.publish(greeted("bob")));
        pollster::block_on(context.publish(greeted("bob")));

        assert_eq!(recorder.0.seen(), [greeted("alice"), greeted("alice"), greeted("bob"), greeted("bob")]);
    }

    #[test]
    fn hands_a_message_again_to_a_subscriber_whose_reaction_failed_at_least_once_is_the_promise() {
        let Setup { recorder, context, .. } = setup();
        *recorder.0.fail_next.lock().unwrap() = true;

        let failed = publish_as(&context, "message-1", greeted("alice"));
        assert_eq!(failed.status(), OperationStatus::Error);
        assert!(recorder.0.seen().is_empty());

        publish_as(&context, "message-1", greeted("alice"));
        assert_eq!(recorder.0.seen(), [greeted("alice")]);
    }

    #[test]
    fn keeps_one_inbox_per_subscriber_so_a_second_subscriber_still_gets_what_the_first_already_handled() {
        let Setup { bus, recorder, context } = setup();
        publish_as(&context, "message-1", greeted("alice"));
        let late = Arc::new(EventSubscriber(Recorder::default()));
        pollster::block_on(bus.subscribe("Greeted", late.clone()));

        publish_as(&context, "message-1", greeted("alice"));

        assert_eq!(recorder.0.seen(), [greeted("alice")]);
        assert_eq!(late.0.seen(), [greeted("alice")]);
    }
}
