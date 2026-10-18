//! Sends every domain event an aggregate recorded, once the surrounding transaction has
//! committed. The events are pulled from the aggregate at that moment, not before: a rollback
//! leaves them where they are, unpublished, to be discarded with it. Extracting and
//! acknowledging the events are one step, taken only when the facts are durable (ADR 3).
//!
//! The handler hands the aggregate over: it has saved it and has nothing left to do with it,
//! and the commit may come later than the call. Command handlers call this as their last step;
//! outside any transaction the events go out at once (see `ExecutionContext::after_commit`).

use architecture_domain::Aggregate;

use crate::execution_context::ExecutionContext;

pub async fn publish_domain_events<A>(mut aggregate: A, context: &ExecutionContext)
where
    A: Aggregate + Send + 'static,
    A::Event: Send + Sync + 'static,
{
    let publisher = context.clone();
    context
        .after_commit(async move {
            for event in aggregate.pull_domain_events() {
                publisher.publish(event).await;
            }
        })
        .await;
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use architecture_domain::{AggregateRoot, DomainEvent, DomainResult, Entity, Event, Exception, Id};

    use super::*;
    use crate::BoxFuture;
    use crate::event_bus::{AnyEvent, AnyHandler, EventBus};
    use crate::execution_context::{Auth, ExecutionContextOptions};
    use crate::operation::Operation;

    #[derive(Debug, Clone, PartialEq)]
    enum Greeting {
        Greeted { name: String },
    }
    impl Event for Greeting {
        fn name(&self) -> &'static str {
            "Greeted"
        }
    }
    impl DomainEvent for Greeting {}

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

    #[derive(Default)]
    struct Recorder(Mutex<Vec<String>>);
    impl EventBus for Recorder {
        fn connect(&self) -> BoxFuture<'_, ()> {
            Box::pin(async {})
        }
        fn publish(&self, event: Arc<dyn AnyEvent>, context: ExecutionContext) -> BoxFuture<'_, Operation> {
            self.0.lock().unwrap().push(format!("{event:?}"));
            Box::pin(async move { Operation::new(event, context) })
        }
        fn subscribe(&self, _channel: &'static str, _handler: Arc<dyn AnyHandler>) -> BoxFuture<'_, ()> {
            Box::pin(async {})
        }
    }

    fn context(recorder: &Arc<Recorder>) -> ExecutionContext {
        ExecutionContext::new(ExecutionContextOptions {
            trace_id: "trace".into(),
            auth: Auth::of("alice", "USER"),
            event_bus: recorder.clone(),
            unit_of_work: None,
            logger: None,
        })
    }

    #[test]
    fn publishes_after_the_commit_everything_the_aggregate_recorded() {
        let recorder = Arc::new(Recorder::default());
        let context = context(&recorder);
        let mut greeter = Greeter(AggregateRoot::new(Id::new("g"), 0));

        pollster::block_on(context.with_transaction(|| async {
            greeter.greet("alice");
            greeter.greet("bob");
            publish_domain_events(greeter, &context).await;
            assert!(recorder.0.lock().unwrap().is_empty()); // nothing leaves before the commit
            Ok(())
        }))
        .expect("committed");

        assert_eq!(*recorder.0.lock().unwrap(), ["Greeted { name: \"alice\" }", "Greeted { name: \"bob\" }"]);
    }

    #[test]
    fn publishes_nothing_when_the_transaction_rolls_back() {
        let recorder = Arc::new(Recorder::default());
        let context = context(&recorder);
        let mut greeter = Greeter(AggregateRoot::new(Id::new("g"), 0));

        let result: DomainResult = pollster::block_on(context.with_transaction(|| async {
            greeter.greet("alice");
            publish_domain_events(greeter, &context).await;
            Err(Exception::not_allowed("Test", "refused"))
        }));

        assert!(result.is_err());
        assert!(recorder.0.lock().unwrap().is_empty());
    }
}
