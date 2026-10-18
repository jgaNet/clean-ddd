//! `Module` wires one bounded context together: its commands, queries, domain events and
//! integration events. It is plain data plus two lookups; the business lives in the handlers
//! (ARCH-MODULES-DATA).
//!
//! A Module is where the application layer (handlers) is bound to the infrastructure
//! (repositories, queries, external services) and subscribed to the event bus. Each context has
//! one wiring crate (`notes-wiring`) that builds it:
//!
//! ```ignore
//! Module::new(ModuleDefinition {
//!     name: "Notes",
//!     commands: vec![Subscription::command(CreateNoteCommandHandler::new(repository.clone()))],
//!     queries: vec![query(GetMyNotesQueryHandler::new(queries.clone()))],
//!     domain_events: vec![Subscription::reaction("NoteCreated", NoteCreatedHandler)],
//!     integration_events: vec![],
//! })
//! ```
//!
//! Anything else a context exposes (a middleware, a service another context needs) is a public
//! item of the same wiring crate, not a slot in the module. From a controller: `accept(&context,
//! CreateNote { … })` for a command, `module.query::<GetMyNotes>().handle(GetMyNotes, &context)`
//! for a query — named by the query, so a controller never names the adapter behind it.

use std::any::{Any, TypeId};
use std::sync::Arc;

use architecture_domain::CommandEvent;

use crate::command_handler::{AnyCommand, CommandHandler, CommandSubscriber};
use crate::event_bus::{AnyHandler, EventBus};
use crate::event_handler::{EventHandler, EventSubscriber};
use crate::query_handler::{AnyQuery, Query, QueryHandler};

/// A handler on the channel it listens to.
pub struct Subscription {
    pub channel: &'static str,
    pub handler: Arc<dyn AnyHandler>,
    /// For a command: the same handler as the `dyn` a synchronous caller runs it through.
    direct: Option<(TypeId, Box<dyn Any + Send + Sync>)>,
}

impl Subscription {
    /// A command handler, on its command's name.
    pub fn command<H: CommandHandler>(handler: H) -> Self {
        let handler = Arc::new(handler);
        let direct: Arc<dyn AnyCommand<H::Command>> = handler.clone();
        Self {
            channel: <H::Command as CommandEvent>::NAME,
            handler: Arc::new(CommandSubscriber(handler)),
            direct: Some((TypeId::of::<H::Command>(), Box::new(direct))),
        }
    }

    /// A reaction to the fact a channel carries (`"NoteShared"`).
    pub fn reaction<H: EventHandler>(channel: &'static str, handler: H) -> Self {
        Self { channel, handler: Arc::new(EventSubscriber(handler)), direct: None }
    }
}

/// A query handler as the module holds it: under the query it answers, as the `dyn` that answers it.
pub struct QueryEntry {
    query: TypeId,
    name: &'static str,
    handler: Box<dyn Any + Send + Sync>,
}

/// A query handler, listed under the query it answers.
pub fn query<H: QueryHandler>(handler: H) -> QueryEntry {
    let handler: Arc<dyn AnyQuery<H::Query>> = Arc::new(handler);
    QueryEntry { query: TypeId::of::<H::Query>(), name: short_name::<H::Query>(), handler: Box::new(handler) }
}

pub struct ModuleDefinition {
    pub name: &'static str,
    pub commands: Vec<Subscription>,
    pub queries: Vec<QueryEntry>,
    pub domain_events: Vec<Subscription>,
    pub integration_events: Vec<Subscription>,
}

pub struct Module {
    name: &'static str,
    commands: Vec<Subscription>,
    queries: Vec<QueryEntry>,
    domain_events: Vec<Subscription>,
    integration_events: Vec<Subscription>,
}

impl Module {
    pub fn new(definition: ModuleDefinition) -> Self {
        Self {
            name: definition.name,
            commands: definition.commands,
            queries: definition.queries,
            domain_events: definition.domain_events,
            integration_events: definition.integration_events,
        }
    }

    pub fn name(&self) -> &'static str {
        self.name
    }

    /// Connects the bus and subscribes every handler to it.
    pub async fn start(&self, event_bus: &dyn EventBus) {
        event_bus.connect().await;
        self.subscribe(event_bus).await;
    }

    pub async fn subscribe(&self, event_bus: &dyn EventBus) {
        for subscription in self.domain_events.iter().chain(&self.commands).chain(&self.integration_events) {
            event_bus.subscribe(subscription.channel, subscription.handler.clone()).await;
        }
    }

    /// The channels this module listens to, in subscription order.
    pub fn channels(&self) -> Vec<&'static str> {
        self.domain_events.iter().chain(&self.commands).chain(&self.integration_events).map(|s| s.channel).collect()
    }

    /// The handler of a command, by the command's type, for the rare command a caller runs
    /// synchronously instead of publishing it (a login): `module.command::<Login>().run(…)`.
    ///
    /// # Panics
    ///
    /// When the module has no handler for that command: a wiring mistake, not a refusal.
    pub fn command<C: CommandEvent + Send + Sync + 'static>(&self) -> &dyn AnyCommand<C> {
        self.commands
            .iter()
            .filter_map(|subscription| subscription.direct.as_ref())
            .filter(|(command, _)| *command == TypeId::of::<C>())
            .find_map(|(_, handler)| handler.downcast_ref::<Arc<dyn AnyCommand<C>>>())
            .map(Arc::as_ref)
            .unwrap_or_else(|| panic!("Missing command handler for {} in module {}", short_name::<C>(), self.name))
    }

    /// The handler of a query, by the query's type: what a controller calls `handle()` on.
    ///
    /// # Panics
    ///
    /// When the module has no handler for that query: a wiring mistake, not a refusal.
    pub fn query<Q: Query>(&self) -> &dyn AnyQuery<Q> {
        self.queries
            .iter()
            .filter(|entry| entry.query == TypeId::of::<Q>())
            .find_map(|entry| entry.handler.downcast_ref::<Arc<dyn AnyQuery<Q>>>())
            .map(Arc::as_ref)
            .unwrap_or_else(|| panic!("Missing query {} in module {}", short_name::<Q>(), self.name))
    }

    /// The queries this module answers, by name, in listing order.
    pub fn queries(&self) -> Vec<&'static str> {
        self.queries.iter().map(|entry| entry.name).collect()
    }
}

fn short_name<T>() -> &'static str {
    std::any::type_name::<T>().rsplit("::").next().unwrap_or("?")
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use architecture_domain::{DomainResult, Event, EventKind};

    use super::*;
    use crate::BoxFuture;
    use crate::execution_context::ExecutionContext;
    use crate::operation::Operation;

    #[derive(Debug, Clone, PartialEq)]
    struct Greet;
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
        type Output = &'static str;
    }
    struct GreetHandler;
    impl CommandHandler for GreetHandler {
        type Command = Greet;
        async fn execute(&self, _: Greet, _: &ExecutionContext) -> DomainResult<&'static str> {
            Ok("hello")
        }
    }

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
    struct WaveHandler;
    impl CommandHandler for WaveHandler {
        type Command = Wave;
        async fn execute(&self, _: Wave, _: &ExecutionContext) -> DomainResult {
            Ok(())
        }
    }

    #[derive(Debug, Clone, PartialEq)]
    struct Bow;
    impl Event for Bow {
        fn name(&self) -> &'static str {
            Self::NAME
        }
        fn kind(&self) -> EventKind {
            EventKind::Command
        }
    }
    impl CommandEvent for Bow {
        const NAME: &'static str = "Bow";
        type Output = ();
    }

    struct CountGreetings;
    impl Query for CountGreetings {
        type Output = u32;
    }
    struct CountGreetingsHandler(u32);
    impl QueryHandler for CountGreetingsHandler {
        type Query = CountGreetings;
        async fn execute(&self, _: CountGreetings, _: &ExecutionContext) -> DomainResult<u32> {
            Ok(self.0)
        }
    }

    #[derive(Default)]
    struct SubscribingBus(Mutex<Vec<&'static str>>);
    impl EventBus for SubscribingBus {
        fn connect(&self) -> BoxFuture<'_, ()> {
            Box::pin(async {})
        }
        fn dispatch(&self, _: Operation) -> BoxFuture<'_, Operation> {
            unreachable!("not used")
        }
        fn subscribe(&self, channel: &'static str, _: Arc<dyn AnyHandler>) -> BoxFuture<'_, ()> {
            self.0.lock().unwrap().push(channel);
            Box::pin(async {})
        }
    }

    fn a_module() -> Module {
        Module::new(ModuleDefinition {
            name: "Greetings",
            commands: vec![Subscription::command(GreetHandler), Subscription::command(WaveHandler)],
            queries: vec![query(CountGreetingsHandler(3))],
            domain_events: vec![],
            integration_events: vec![],
        })
    }

    #[test]
    fn finds_a_command_handler_by_its_command_and_a_query_handler_by_its_query() {
        let module = a_module();
        let context = ExecutionContext::new(crate::ExecutionContextOptions {
            trace_id: "trace".into(),
            auth: crate::Auth::anonymous(),
            event_bus: Arc::new(SubscribingBus::default()),
            unit_of_work: None,
            logger: None,
        });

        let greeting = pollster::block_on(module.command::<Greet>().run(Greet, &context));
        let count = pollster::block_on(module.query::<CountGreetings>().handle(CountGreetings, &context));

        assert_eq!(greeting.expect("run"), "hello");
        assert_eq!(count.expect("answered"), 3);
        assert_eq!(module.queries(), ["CountGreetings"]);
    }

    #[test]
    #[should_panic(expected = "Missing command handler for Bow in module Greetings")]
    fn names_what_is_missing() {
        a_module().command::<Bow>();
    }

    #[test]
    fn subscribes_every_handler_to_its_event_name() {
        let bus = SubscribingBus::default();

        pollster::block_on(a_module().subscribe(&bus));

        assert_eq!(*bus.0.lock().unwrap(), ["Greet", "Wave"]);
        assert_eq!(a_module().channels(), ["Greet", "Wave"]);
    }
}
