//! `CommandHandler` is the shape of every use case that changes state (the "C" of CQRS).
//!
//! A concrete handler only writes `execute()`: load an aggregate, call a behaviour on it, save
//! it, publish its events. Everything else that every command needs is done once, in the
//! provided `handle()`:
//!
//! 1. `guard()`    — authorization: may this caller run this command at all?
//! 2. logging      — what ran, and whether it failed
//! 3. transaction  — `execute()` runs inside the context's unit of work when there is one
//! 4. safety net   — a panic becomes a failed operation instead of a crash
//!
//! The handler is subscribed to its command on the event bus by the Module, wrapped in a
//! [`CommandSubscriber`] that gives it its command back from the type-erased operation. The
//! rare command a caller needs the answer of at once (a login, whose token must not travel
//! through the bus and its records) is found in the module by its command's type and run
//! through `run()`: the same guard, transaction and safety net, the typed answer in return.
//! See the Notes context's `EditNoteCommandHandler` for the canonical example.

use std::any::{Any, type_name};
use std::future::Future;
use std::sync::Arc;

use architecture_domain::{CommandEvent, DomainResult};
use serde::Serialize;

use crate::BoxFuture;
use crate::event_bus::AnyHandler;
use crate::execution_context::ExecutionContext;
use crate::operation::Operation;

pub trait CommandHandler: Send + Sync + 'static {
    /// The command it handles; what it answers with is the command's `Output`, serializable
    /// because the Tracker shows it to the client who asked.
    type Command: CommandEvent<Output: Serialize> + Send + Sync + 'static;

    /// Authorization hook. Override it to refuse callers who may not run this command. Business
    /// rules about *what* they may do to *which* object belong in the aggregate.
    fn guard(
        &self,
        _command: &Self::Command,
        _context: &ExecutionContext,
    ) -> impl Future<Output = DomainResult> + Send {
        async { Ok(()) }
    }

    /// The use case. Implement it in each concrete handler.
    fn execute(
        &self,
        command: Self::Command,
        context: &ExecutionContext,
    ) -> impl Future<Output = DomainResult<<Self::Command as CommandEvent>::Output>> + Send;

    /// The command, run to its typed answer: the guard, the log, the transaction, the safety
    /// net. What `handle()` does for the bus, and what a controller calls for a command it
    /// needs the answer of at once. Not meant to be overridden.
    fn run(
        &self,
        command: Self::Command,
        context: &ExecutionContext,
    ) -> impl Future<Output = DomainResult<<Self::Command as CommandEvent>::Output>> + Send {
        async move {
            let name = Self::Command::NAME;
            if let Err(refusal) = self.guard(&command, context).await {
                log_warn(context, &format!("{name} refused: {}", refusal.message()));
                return Err(refusal);
            }
            if let Some(logger) = context.logger() {
                logger.info(context.trace_id(), &format!("Executing {name}"));
            }
            let result = context.with_transaction(|| self.execute(command, context)).await;
            if let Err(failure) = &result {
                log_warn(context, &format!("{name} failed: {}", failure.message()));
            }
            result
        }
    }

    /// What the bus calls: the guard, the log, the transaction around `execute()`, the outcome
    /// on the operation. Not meant to be overridden.
    fn handle(&self, operation: Operation) -> impl Future<Output = Operation> + Send {
        async move {
            let name = operation.event().name();
            let Some(command) = operation.event_as::<Self::Command>().cloned() else {
                return operation.failed(architecture_domain::Exception::unknown(format!(
                    "{} received an event it does not handle: {}",
                    type_name::<Self>(),
                    name
                )));
            };
            let context = operation.context().clone();

            match self.run(command, &context).await {
                Ok(value) => operation.success(Arc::new(value)),
                Err(failure) => operation.failed(failure),
            }
        }
    }
}

/// A command handler as the module holds it for a synchronous caller: whoever has a `C` gets
/// its answer, without knowing which handler, over which adapters, answers it.
pub trait AnyCommand<C: CommandEvent>: Send + Sync {
    fn run<'a>(&'a self, command: C, context: &'a ExecutionContext) -> BoxFuture<'a, DomainResult<C::Output>>;
}

impl<H: CommandHandler> AnyCommand<H::Command> for H {
    fn run<'a>(
        &'a self,
        command: H::Command,
        context: &'a ExecutionContext,
    ) -> BoxFuture<'a, DomainResult<<H::Command as CommandEvent>::Output>> {
        Box::pin(CommandHandler::run(self, command, context))
    }
}

fn log_warn(context: &ExecutionContext, message: &str) {
    if let Some(logger) = context.logger() {
        logger.warn(context.trace_id(), message);
    }
}

/// A command handler as the bus holds it: the one place the type-erased operation meets the typed handler.
pub struct CommandSubscriber<H: CommandHandler>(pub Arc<H>);

impl<H: CommandHandler> AnyHandler for CommandSubscriber<H> {
    fn handle(&self, operation: Operation) -> BoxFuture<'_, Operation> {
        Box::pin(self.0.handle(operation))
    }

    fn as_any(&self) -> &dyn Any {
        self
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use architecture_domain::{Aggregate, AggregateRoot, DomainEvent, Entity, Event, EventKind, Exception, Id};

    use super::*;
    use crate::domain_events::publish_domain_events;
    use crate::event_bus::EventBus;
    use crate::execution_context::{Auth, ExecutionContextOptions, UnitOfWork};
    use crate::operation::OperationStatus;

    #[derive(Debug, Clone, PartialEq)]
    struct Greet {
        name: String,
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

    /// The shape of every concrete handler: a guard for who may call, an execute for the use case.
    struct GreetHandler;
    impl CommandHandler for GreetHandler {
        type Command = Greet;

        async fn guard(&self, _command: &Greet, context: &ExecutionContext) -> DomainResult {
            match context.auth().role.as_deref() {
                Some("guest") => Err(Exception::not_allowed("Test", "Guests cannot greet")),
                _ => Ok(()),
            }
        }

        async fn execute(&self, command: Greet, context: &ExecutionContext) -> DomainResult<String> {
            match command.then {
                Some("throw") => panic!("boom"),
                Some("fail") => return Err(Exception::not_allowed("Test", "Refused")),
                _ => {}
            }
            let mut greeter = Greeter(AggregateRoot::new(Id::new("greeter"), 0));
            greeter.greet(&command.name);
            publish_domain_events(greeter, context).await;
            Ok(format!("Hello {}", command.name))
        }
    }

    /// Records what was published and when, in the same log as the unit of work.
    #[derive(Default)]
    struct Recorder {
        log: Mutex<Vec<String>>,
        active: Mutex<bool>,
    }
    impl EventBus for Recorder {
        fn connect(&self) -> BoxFuture<'_, ()> {
            Box::pin(async {})
        }
        fn dispatch(&self, operation: Operation) -> BoxFuture<'_, Operation> {
            self.log.lock().unwrap().push(format!("publish {:?}", operation.event()));
            Box::pin(async move { operation })
        }
        fn subscribe(&self, _channel: &'static str, _handler: Arc<dyn AnyHandler>) -> BoxFuture<'_, ()> {
            Box::pin(async {})
        }
    }
    impl UnitOfWork for Recorder {
        fn begin_transaction(&self) -> BoxFuture<'_, ()> {
            *self.active.lock().unwrap() = true;
            self.log.lock().unwrap().push("begin".into());
            Box::pin(async {})
        }
        fn commit_transaction(&self) -> BoxFuture<'_, ()> {
            *self.active.lock().unwrap() = false;
            self.log.lock().unwrap().push("commit".into());
            Box::pin(async {})
        }
        fn rollback_transaction(&self) -> BoxFuture<'_, ()> {
            *self.active.lock().unwrap() = false;
            self.log.lock().unwrap().push("rollback".into());
            Box::pin(async {})
        }
        fn has_active_transaction(&self) -> bool {
            *self.active.lock().unwrap()
        }
    }

    fn operation_for(recorder: &Arc<Recorder>, command: Greet, role: &str) -> Operation {
        let context = ExecutionContext::new(ExecutionContextOptions {
            trace_id: "trace".into(),
            auth: Auth::of("alice", role),
            event_bus: recorder.clone(),
            unit_of_work: Some(recorder.clone()),
            logger: None,
        });
        Operation::new(Arc::new(command), context)
    }

    fn log(recorder: &Recorder) -> Vec<String> {
        recorder.log.lock().unwrap().clone()
    }

    #[test]
    fn runs_the_use_case_inside_a_transaction_and_publishes_the_domain_events_after_the_commit() {
        let recorder = Arc::new(Recorder::default());
        let operation = operation_for(&recorder, Greet { name: "Alice".into(), then: None }, "user");

        let done = pollster::block_on(GreetHandler.handle(operation));

        assert_eq!(done.status(), OperationStatus::Success);
        assert_eq!(done.value::<String>().map(String::as_str), Some("Hello Alice"));
        assert_eq!(log(&recorder), ["begin", "commit", "publish Greeted { name: \"Alice\" }"]);
    }

    #[test]
    fn refuses_at_the_guard_without_opening_a_transaction_or_running_the_use_case() {
        let recorder = Arc::new(Recorder::default());
        let operation = operation_for(&recorder, Greet { name: "Alice".into(), then: None }, "guest");

        let done = pollster::block_on(GreetHandler.handle(operation));

        assert_eq!(done.status(), OperationStatus::Error);
        assert!(done.error().expect("refused").is(architecture_domain::common_exceptions::NOT_ALLOWED));
        assert!(log(&recorder).is_empty());
    }

    #[test]
    fn rolls_back_a_failed_result_and_publishes_nothing() {
        let recorder = Arc::new(Recorder::default());
        let operation = operation_for(&recorder, Greet { name: "Alice".into(), then: Some("fail") }, "user");

        let done = pollster::block_on(GreetHandler.handle(operation));

        assert_eq!(done.status(), OperationStatus::Error);
        assert_eq!(log(&recorder), ["begin", "rollback"]);
    }

    #[test]
    fn turns_a_panic_into_a_failed_operation_instead_of_crashing_and_rolls_back() {
        let recorder = Arc::new(Recorder::default());
        let operation = operation_for(&recorder, Greet { name: "Alice".into(), then: Some("throw") }, "user");

        let done = pollster::block_on(GreetHandler.handle(operation));

        assert_eq!(done.status(), OperationStatus::Error);
        assert_eq!(done.error().expect("failed").message(), "boom");
        assert_eq!(log(&recorder), ["begin", "rollback"]);
    }
}
