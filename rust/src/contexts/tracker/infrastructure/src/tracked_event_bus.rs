//! Decorates any `EventBus` so that every operation it carries is projected into the Tracker
//! records: when dispatched (`PENDING`) and again once handled (`SUCCESS` / `ERROR` / `SENT`).
//! When a command sent by an authenticated caller reaches its outcome, it also publishes
//! `OperationCompleteIntegrationEvent`, which the Notifications context turns into a live
//! notification: one notice per command, once there is something to say.
//!
//! Tracking is a cross-cutting concern: the inner bus does not know it is being watched, and
//! the handlers do not know they are being recorded. The inner bus awaits the handlers, so the
//! outcome is known when `dispatch` returns; the events a handler publishes meanwhile go through
//! the context's bus, which is this one, and are recorded on their own.

use std::sync::Arc;

use architecture_application::{AnyHandler, BoxFuture, EventBus, Operation, OperationStatus};
use architecture_domain::EventKind;
use shared_kernel_application::integration_events::tracker_integration_events::OperationCompleteIntegrationEvent;
use tracker_application::ports::OperationRecords;
use tracker_application::projection::to_operation_record;

pub struct TrackedEventBus<R> {
    bus: Arc<dyn EventBus>,
    records: Arc<R>,
}

impl<R: OperationRecords + Send + Sync + 'static> TrackedEventBus<R> {
    pub fn new(bus: Arc<dyn EventBus>, records: Arc<R>) -> Self {
        Self { bus, records }
    }

    async fn notify_completion(&self, operation: &Operation, user_id: String) {
        let notice = OperationCompleteIntegrationEvent {
            operation_id: operation.id().to_string(),
            user_id,
            status: operation.status().as_str().to_string(),
            kind: operation.event().name().to_string(),
            result: operation.value_as_json(),
            error: operation.error().map(|error| error.message().to_string()),
        };
        self.bus.publish(Arc::new(notice), operation.context().clone()).await;
    }
}

impl<R: OperationRecords + Send + Sync + 'static> EventBus for TrackedEventBus<R> {
    fn connect(&self) -> BoxFuture<'_, ()> {
        self.bus.connect()
    }

    fn dispatch(&self, operation: Operation) -> BoxFuture<'_, Operation> {
        Box::pin(async move {
            // The completion notice is about an operation; it is not one worth tracking itself.
            if operation.event().name() == OperationCompleteIntegrationEvent::NAME {
                return self.bus.dispatch(operation).await;
            }

            self.records.save(to_operation_record(&operation)).await;
            let done = self.bus.dispatch(operation).await;
            self.records.save(to_operation_record(&done)).await;

            // Only a command is something a client asked for and waits on, and only its outcome
            // is worth a notice (the client already holds the 202). Domain and integration events
            // are recorded for the trace but never announced: announcing them would notify about
            // the notification, which is itself an event, and so on without end.
            let is_command = done.event().kind() == EventKind::Command;
            let is_outcome = matches!(done.status(), OperationStatus::Success | OperationStatus::Error);
            if let (true, true, Some(user_id)) = (is_command, is_outcome, done.context().auth().subject_id.clone()) {
                self.notify_completion(&done, user_id).await;
            }
            done
        })
    }

    fn subscribe(&self, channel: &'static str, handler: Arc<dyn AnyHandler>) -> BoxFuture<'_, ()> {
        self.bus.subscribe(channel, handler)
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use architecture_application::{
        Auth, CommandHandler, CommandSubscriber, EventHandler, EventSubscriber, ExecutionContext,
        ExecutionContextOptions,
    };
    use architecture_domain::{CommandEvent, DomainEvent, DomainResult, Event, Exception};
    use architecture_infrastructure::{InMemoryDataSource, InMemoryEventBus};

    use super::*;
    use crate::records::InMemoryOperationRecords;

    #[derive(Debug, Clone, PartialEq)]
    struct Greet {
        then: Option<&'static str>,
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
        type Output = String;
    }

    #[derive(Debug, Clone, PartialEq)]
    struct Greeted;
    impl Event for Greeted {
        fn name(&self) -> &'static str {
            "Greeted"
        }
        fn kind(&self) -> EventKind {
            EventKind::Domain
        }
    }
    impl DomainEvent for Greeted {}

    struct GreetHandler;
    impl CommandHandler for GreetHandler {
        type Command = Greet;
        async fn execute(&self, command: Greet, context: &ExecutionContext) -> DomainResult<String> {
            if command.then == Some("fail") {
                return Err(Exception::not_allowed("Test", "Refused"));
            }
            context.publish(Greeted).await;
            Ok("hello".into())
        }
    }

    struct OnGreeted;
    impl EventHandler for OnGreeted {
        type Event = Greeted;
        async fn execute(&self, _: Greeted, _: &ExecutionContext) -> DomainResult {
            Ok(())
        }
    }

    #[derive(Default)]
    struct Notices(Mutex<Vec<OperationCompleteIntegrationEvent>>);
    impl EventHandler for Notices {
        type Event = OperationCompleteIntegrationEvent;
        async fn execute(&self, event: OperationCompleteIntegrationEvent, _: &ExecutionContext) -> DomainResult {
            self.0.lock().unwrap().push(event);
            Ok(())
        }
    }

    struct Setup {
        bus: Arc<TrackedEventBus<InMemoryOperationRecords>>,
        records: Arc<InMemoryOperationRecords>,
        notices: Arc<EventSubscriber<Notices>>,
    }

    fn setup() -> Setup {
        let records = Arc::new(InMemoryOperationRecords::new(Arc::new(InMemoryDataSource::new())));
        let bus = Arc::new(TrackedEventBus::new(Arc::new(InMemoryEventBus::new()), records.clone()));
        let notices = Arc::new(EventSubscriber(Notices::default()));
        pollster::block_on(bus.subscribe("Greet", Arc::new(CommandSubscriber(Arc::new(GreetHandler)))));
        pollster::block_on(bus.subscribe("Greeted", Arc::new(EventSubscriber(OnGreeted))));
        pollster::block_on(bus.subscribe(OperationCompleteIntegrationEvent::NAME, notices.clone()));
        Setup { bus, records, notices }
    }

    fn context(bus: &Arc<TrackedEventBus<InMemoryOperationRecords>>, auth: Auth) -> ExecutionContext {
        ExecutionContext::new(ExecutionContextOptions {
            trace_id: "trace".into(),
            auth,
            event_bus: bus.clone(),
            unit_of_work: None,
            logger: None,
        })
    }

    #[test]
    fn records_a_command_up_to_its_outcome_and_the_events_it_set_off_under_the_same_trace() {
        let Setup { bus, records, .. } = setup();

        let done = pollster::block_on(context(&bus, Auth::of("alice", "USER")).publish(Greet { then: None }));

        let trace = pollster::block_on(records.find_by_trace_id("trace"));
        let summary: Vec<(&str, &str)> = trace.iter().map(|r| (r.name.as_str(), r.status.as_str())).collect();
        assert_eq!(summary, [("Greet", "SUCCESS"), ("Greeted", "SENT")]);
        let record = pollster::block_on(records.find_by_id(done.id())).expect("recorded");
        assert_eq!(record.result, Some(serde_json::json!("hello")));
        assert_eq!(record.subject_id.as_deref(), Some("alice"));
    }

    #[test]
    fn announces_the_outcome_of_an_authenticated_callers_command_and_nothing_else() {
        let Setup { bus, records, notices } = setup();

        pollster::block_on(context(&bus, Auth::of("alice", "USER")).publish(Greet { then: None }));
        pollster::block_on(context(&bus, Auth::of("alice", "USER")).publish(Greet { then: Some("fail") }));
        pollster::block_on(context(&bus, Auth::anonymous()).publish(Greet { then: None }));

        let announced: Vec<(String, String)> =
            notices.0.0.lock().unwrap().iter().map(|n| (n.kind.clone(), n.status.clone())).collect();
        assert_eq!(announced, [("Greet".into(), "SUCCESS".into()), ("Greet".into(), "ERROR".into())]);
        // The notice itself is not recorded; the three commands and their reactions are.
        let names: Vec<String> = pollster::block_on(records.find_all()).into_iter().map(|r| r.name).collect();
        assert!(!names.iter().any(|name| name == OperationCompleteIntegrationEvent::NAME));
        assert_eq!(names.iter().filter(|name| *name == "Greet").count(), 3);
    }
}
