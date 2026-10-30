//! Makes every domain event an aggregate recorded durable with the state it describes, and lets
//! the context publish it after the commit (ADR 3, ADR 24). The events are pulled from the
//! aggregate at commit time, not before: what is stored is everything the aggregate recorded
//! during the transaction, and a rollback leaves the aggregate's events where they are,
//! unpublished, to be discarded with it. Extracting and storing the events are one step, taken
//! only when the facts are about to be durable; publishing them is the relay's, once they are.
//!
//! The handler hands the aggregate over: it has saved it and has nothing left to do with it,
//! and the commit may come later than the call. Command handlers call this as their last step;
//! so does a reaction that changed an aggregate, in the transaction of its own the base event
//! handler opens (ADR 30). A context without a unit of work (a handler's unit test) has no
//! outbox: there the events go straight to the bus once the use case has succeeded, as
//! `ExecutionContext::after_commit` promises. Outside any transaction (a handler's unit test
//! calling `execute()` directly) the events are stored and relayed at once.
//!
//! `publish_integration_event()` does the same for a fact a reaction tells other contexts: the
//! reaction that translates a domain event into the published contract calls it, and the fact
//! goes out through the outbox when the reaction's transaction commits, under the entry's id —
//! never straight to the bus, where a rollback could not take it back (ADR 30).

use std::sync::Arc;

use architecture_domain::{Aggregate, IntegrationEvent};

use crate::event_bus::AnyEvent;
use crate::execution_context::ExecutionContext;

pub async fn publish_domain_events<A>(mut aggregate: A, context: &ExecutionContext)
where
    A: Aggregate + Send + 'static,
    A::Event: Send + Sync + 'static,
{
    durable(
        move || aggregate.pull_domain_events().into_iter().map(|event| Arc::new(event) as Arc<dyn AnyEvent>).collect(),
        context,
    )
    .await;
}

/// Tells other contexts a fact the way a domain event is told (ADR 30): appended to the outbox
/// when the reaction's transaction commits, relayed after it, under the entry's id. The reaction
/// that translates a domain event into the published contract calls it; nothing publishes an
/// integration event straight to the bus, where a rollback could not take it back.
pub async fn publish_integration_event<E>(event: E, context: &ExecutionContext)
where
    E: IntegrationEvent + Send + Sync + 'static,
{
    durable(move || vec![Arc::new(event) as Arc<dyn AnyEvent>], context).await;
}

/// At commit, the events are appended to the outbox; without a unit of work, published once the use case has succeeded.
async fn durable<F>(events: F, context: &ExecutionContext)
where
    F: FnOnce() -> Vec<Arc<dyn AnyEvent>> + Send + 'static,
{
    let Some(unit_of_work) = context.unit_of_work().cloned() else {
        let publisher = context.clone();
        context
            .after_commit(async move {
                for event in events() {
                    publisher.event_bus().publish(event, publisher.clone()).await;
                }
            })
            .await;
        return;
    };
    context
        .before_commit(async move {
            unit_of_work.outbox().append(events()).await;
        })
        .await;
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use architecture_domain::{
        AggregateRoot, DomainEvent, DomainResult, Entity, Event, EventKind, Exception, Id, IntegrationEvent,
    };

    use super::*;
    use crate::BoxFuture;
    use crate::event_bus::{AnyHandler, EventBus};
    use crate::execution_context::{Auth, ExecutionContextOptions, UnitOfWork};
    use crate::operation::Operation;
    use crate::outbox::Outbox;
    use crate::outbox::testing::FakeOutbox;

    #[derive(Debug, Clone, PartialEq)]
    enum Greeting {
        Greeted { name: String },
    }
    impl Event for Greeting {
        fn name(&self) -> &'static str {
            "Greeted"
        }
        fn kind(&self) -> EventKind {
            EventKind::Domain
        }
    }
    impl DomainEvent for Greeting {}

    /// A fact told to other contexts: what a reaction publishes.
    #[derive(Debug, Clone, PartialEq)]
    struct Told {
        who: String,
    }
    impl Event for Told {
        fn name(&self) -> &'static str {
            "Told"
        }
        fn kind(&self) -> EventKind {
            EventKind::Integration
        }
    }
    impl IntegrationEvent for Told {}

    struct Greeter(AggregateRoot<Greeting>);
    impl Greeter {
        fn greet(&mut self, name: &str) {
            self.0.record(Greeting::Greeted { name: name.into() });
        }
    }
    impl Entity for Greeter {
        fn id(&self) -> &Id {
            self.0.id()
        }
    }
    impl Aggregate for Greeter {
        type Event = Greeting;
        fn pull_domain_events(&mut self) -> Vec<Greeting> {
            self.0.pull_domain_events()
        }
    }

    /// Records what the bus really took, with the operation's id; told to, it refuses one dispatch with a panic.
    #[derive(Default)]
    struct Recorder {
        delivered: Mutex<Vec<(String, String)>>,
        down_once: Mutex<bool>,
    }
    impl Recorder {
        fn events(&self) -> Vec<String> {
            self.delivered.lock().unwrap().iter().map(|(_, event)| event.clone()).collect()
        }
        fn ids(&self) -> Vec<String> {
            self.delivered.lock().unwrap().iter().map(|(id, _)| id.clone()).collect()
        }
    }
    impl EventBus for Recorder {
        fn connect(&self) -> BoxFuture<'_, ()> {
            Box::pin(async {})
        }
        fn dispatch(&self, operation: Operation) -> BoxFuture<'_, Operation> {
            if std::mem::take(&mut *self.down_once.lock().unwrap()) {
                panic!("the bus is down");
            }
            self.delivered.lock().unwrap().push((operation.id().to_string(), format!("{:?}", operation.event())));
            Box::pin(async move { operation })
        }
        fn subscribe(&self, _channel: &'static str, _handler: Arc<dyn AnyHandler>) -> BoxFuture<'_, ()> {
            Box::pin(async {})
        }
    }

    /// A transaction boundary that only holds the outbox: the context's steps are what is under test.
    #[derive(Default)]
    struct OutboxOnly {
        active: Mutex<bool>,
        outbox: FakeOutbox,
    }
    impl UnitOfWork for OutboxOnly {
        fn begin_transaction(&self) -> BoxFuture<'_, ()> {
            *self.active.lock().unwrap() = true;
            Box::pin(async {})
        }
        fn commit_transaction(&self) -> BoxFuture<'_, ()> {
            *self.active.lock().unwrap() = false;
            Box::pin(async {})
        }
        fn rollback_transaction(&self) -> BoxFuture<'_, ()> {
            *self.active.lock().unwrap() = false;
            Box::pin(async {})
        }
        fn has_active_transaction(&self) -> bool {
            *self.active.lock().unwrap()
        }
        fn outbox(&self) -> &dyn Outbox {
            &self.outbox
        }
        fn another(&self) -> Arc<dyn UnitOfWork> {
            Arc::new(OutboxOnly::default())
        }
    }

    fn context(recorder: &Arc<Recorder>, unit_of_work: Option<&Arc<OutboxOnly>>) -> ExecutionContext {
        ExecutionContext::new(ExecutionContextOptions {
            trace_id: "trace".into(),
            auth: Auth::of("alice", "USER"),
            event_bus: recorder.clone(),
            unit_of_work: unit_of_work.map(|uow| uow.clone() as Arc<dyn UnitOfWork>),
            logger: None,
        })
    }

    #[test]
    fn stores_at_commit_everything_the_aggregate_recorded_during_the_transaction_and_publishes_it_after() {
        let recorder = Arc::new(Recorder::default());
        let uow = Arc::new(OutboxOnly::default());
        let context = context(&recorder, Some(&uow));
        let mut greeter = Greeter(AggregateRoot::new(Id::new("g"), 0));

        pollster::block_on(context.with_transaction(|| async {
            greeter.greet("alice");
            greeter.greet("bob");
            publish_domain_events(greeter, &context).await;
            assert!(uow.outbox.entries().is_empty()); // stored at the commit, not before
            assert!(recorder.events().is_empty()); // nothing leaves before the commit
            Ok(())
        }))
        .expect("committed");

        assert_eq!(recorder.events(), ["Greeted { name: \"alice\" }", "Greeted { name: \"bob\" }"]);
        assert!(uow.outbox.entries().is_empty());
    }

    #[test]
    fn publishes_each_fact_with_its_outbox_entry_as_the_operation_id_so_the_bus_can_recognise_it() {
        let recorder = Arc::new(Recorder::default());
        let uow = Arc::new(OutboxOnly::default());
        let context = context(&recorder, Some(&uow));
        let mut greeter = Greeter(AggregateRoot::new(Id::new("g"), 0));

        pollster::block_on(context.with_transaction(|| async {
            greeter.greet("alice");
            greeter.greet("bob");
            publish_domain_events(greeter, &context).await;
            Ok(())
        }))
        .expect("committed");

        assert_eq!(recorder.ids(), uow.outbox.appended());
        assert_eq!(recorder.ids().len(), 2);
    }

    #[test]
    fn stores_nothing_and_leaves_the_events_on_the_aggregate_when_the_transaction_rolls_back() {
        let recorder = Arc::new(Recorder::default());
        let uow = Arc::new(OutboxOnly::default());
        let context = context(&recorder, Some(&uow));
        let mut greeter = Greeter(AggregateRoot::new(Id::new("g"), 0));

        let result: DomainResult = pollster::block_on(context.with_transaction(|| async {
            greeter.greet("alice");
            // The aggregate is handed over by value: a rollback drops the step, and the events
            // with the aggregate, which is what leaves them unpublished — and unstored.
            publish_domain_events(greeter, &context).await;
            Err(Exception::not_allowed("Test", "refused"))
        }));

        assert!(result.is_err());
        assert!(recorder.events().is_empty());
        assert!(uow.outbox.entries().is_empty());
        assert!(uow.outbox.appended().is_empty());
    }

    #[test]
    fn keeps_a_fact_the_relay_could_not_publish_and_the_next_commit_publishes_it() {
        let recorder = Arc::new(Recorder::default());
        let uow = Arc::new(OutboxOnly::default());
        let context = context(&recorder, Some(&uow));
        let mut greeter = Greeter(AggregateRoot::new(Id::new("g"), 0));
        *recorder.down_once.lock().unwrap() = true;

        pollster::block_on(context.with_transaction(|| async {
            greeter.greet("alice");
            publish_domain_events(greeter, &context).await;
            Ok(())
        }))
        .expect("committed");
        assert!(recorder.events().is_empty());
        let pending: Vec<String> = uow.outbox.entries().iter().map(|entry| format!("{:?}", entry.event)).collect();
        assert_eq!(pending, ["Greeted { name: \"alice\" }"]);

        let mut other = Greeter(AggregateRoot::new(Id::new("h"), 0));
        pollster::block_on(context.with_transaction(|| async {
            other.greet("bob");
            publish_domain_events(other, &context).await;
            Ok(())
        }))
        .expect("committed");
        assert_eq!(recorder.events(), ["Greeted { name: \"alice\" }", "Greeted { name: \"bob\" }"]);
        assert!(uow.outbox.entries().is_empty());
    }

    #[test]
    fn stores_and_publishes_at_once_outside_any_transaction_a_handler_s_execute_called_directly() {
        let recorder = Arc::new(Recorder::default());
        let uow = Arc::new(OutboxOnly::default());
        let context = context(&recorder, Some(&uow));
        let mut greeter = Greeter(AggregateRoot::new(Id::new("g"), 0));
        greeter.greet("alice");

        pollster::block_on(publish_domain_events(greeter, &context));

        assert_eq!(recorder.events(), ["Greeted { name: \"alice\" }"]);
        assert_eq!(recorder.ids(), uow.outbox.appended());
        assert!(uow.outbox.entries().is_empty());
    }

    #[test]
    fn goes_straight_to_the_bus_once_the_use_case_has_succeeded_when_there_is_no_unit_of_work() {
        let recorder = Arc::new(Recorder::default());
        let context = context(&recorder, None);
        let mut greeter = Greeter(AggregateRoot::new(Id::new("g"), 0));

        pollster::block_on(context.with_transaction(|| async {
            greeter.greet("alice");
            publish_domain_events(greeter, &context).await;
            assert!(recorder.events().is_empty());
            Ok(())
        }))
        .expect("succeeded");

        assert_eq!(recorder.events(), ["Greeted { name: \"alice\" }"]);
    }

    #[test]
    fn publishes_nothing_when_the_transaction_rolls_back_without_a_unit_of_work() {
        let recorder = Arc::new(Recorder::default());
        let context = context(&recorder, None);
        let mut greeter = Greeter(AggregateRoot::new(Id::new("g"), 0));

        let result: DomainResult = pollster::block_on(context.with_transaction(|| async {
            greeter.greet("alice");
            publish_domain_events(greeter, &context).await;
            Err(Exception::not_allowed("Test", "refused"))
        }));

        assert!(result.is_err());
        assert!(recorder.events().is_empty());
    }

    #[test]
    fn tells_other_contexts_through_the_outbox_at_commit_and_after_it_under_the_entry_id() {
        let recorder = Arc::new(Recorder::default());
        let uow = Arc::new(OutboxOnly::default());
        let context = context(&recorder, Some(&uow));

        pollster::block_on(context.with_transaction(|| async {
            publish_integration_event(Told { who: "ann".into() }, &context).await;
            assert!(uow.outbox.entries().is_empty()); // stored at the commit, not before
            assert!(recorder.events().is_empty()); // nothing leaves before the commit
            Ok(())
        }))
        .expect("committed");

        assert_eq!(recorder.events(), ["Told { who: \"ann\" }"]);
        assert_eq!(recorder.ids(), uow.outbox.appended());
        assert!(uow.outbox.entries().is_empty());
    }

    #[test]
    fn tells_nothing_when_the_transaction_rolls_back() {
        let recorder = Arc::new(Recorder::default());
        let uow = Arc::new(OutboxOnly::default());
        let context = context(&recorder, Some(&uow));

        let result: DomainResult = pollster::block_on(context.with_transaction(|| async {
            publish_integration_event(Told { who: "ann".into() }, &context).await;
            Err(Exception::not_allowed("Test", "refused"))
        }));

        assert!(result.is_err());
        assert!(recorder.events().is_empty());
        assert!(uow.outbox.appended().is_empty());
    }

    #[test]
    fn tells_other_contexts_once_the_use_case_has_succeeded_when_there_is_no_unit_of_work() {
        let recorder = Arc::new(Recorder::default());
        let context = context(&recorder, None);

        pollster::block_on(context.with_transaction(|| async {
            publish_integration_event(Told { who: "ann".into() }, &context).await;
            assert!(recorder.events().is_empty());
            Ok(())
        }))
        .expect("succeeded");

        assert_eq!(recorder.events(), ["Told { who: \"ann\" }"]);
    }
}
