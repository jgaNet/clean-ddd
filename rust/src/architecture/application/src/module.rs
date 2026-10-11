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
//! item of the same wiring crate, not a slot in the module. From a controller:
//! `context.publish(CreateNote { … }).await` for a command, `module.query::<GetMyNotesQueryHandler>()`
//! then `handle()` for a query.

use std::any::Any;
use std::sync::Arc;

use architecture_domain::CommandEvent;

use crate::command_handler::{CommandHandler, CommandSubscriber};
use crate::event_bus::{AnyHandler, EventBus};
use crate::event_handler::{EventHandler, EventSubscriber};
use crate::query_handler::QueryHandler;

/// A handler on the channel it listens to.
pub struct Subscription {
    pub channel: &'static str,
    pub handler: Arc<dyn AnyHandler>,
}

impl Subscription {
    /// A command handler, on its command's name.
    pub fn command<H: CommandHandler>(handler: H) -> Self {
        Self { channel: <H::Command as CommandEvent>::NAME, handler: Arc::new(CommandSubscriber(handler)) }
    }

    /// A reaction to the fact a channel carries (`"NoteShared"`).
    pub fn reaction<H: EventHandler>(channel: &'static str, handler: H) -> Self {
        Self { channel, handler: Arc::new(EventSubscriber(handler)) }
    }
}

/// A query handler as the module holds it, found back by its type.
pub type AnyQuery = Box<dyn Any + Send + Sync>;

pub fn query<H: QueryHandler>(handler: H) -> AnyQuery {
    Box::new(handler)
}

pub struct ModuleDefinition {
    pub name: &'static str,
    pub commands: Vec<Subscription>,
    pub queries: Vec<AnyQuery>,
    pub domain_events: Vec<Subscription>,
    pub integration_events: Vec<Subscription>,
}

pub struct Module {
    name: &'static str,
    commands: Vec<Subscription>,
    queries: Vec<AnyQuery>,
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

    /// For the rare command a caller runs synchronously instead of publishing it (a login).
    ///
    /// # Panics
    ///
    /// When the module has no such handler: a wiring mistake, not a refusal.
    pub fn command<H: CommandHandler>(&self) -> &H {
        self.commands
            .iter()
            .find_map(|subscription| subscription.handler.as_any().downcast_ref::<CommandSubscriber<H>>())
            .map(|subscriber| &subscriber.0)
            .unwrap_or_else(|| panic!("Missing command handler {} in module {}", short_name::<H>(), self.name))
    }

    /// # Panics
    ///
    /// When the module has no such query: a wiring mistake, not a refusal.
    pub fn query<H: QueryHandler>(&self) -> &H {
        self.queries
            .iter()
            .find_map(|handler| handler.downcast_ref::<H>())
            .unwrap_or_else(|| panic!("Missing query {} in module {}", short_name::<H>(), self.name))
    }
}

fn short_name<T>() -> &'static str {
    std::any::type_name::<T>().rsplit("::").next().unwrap_or("?")
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use architecture_domain::{DomainResult, Event};

    use super::*;
    use crate::BoxFuture;
    use crate::event_bus::AnyEvent;
    use crate::execution_context::ExecutionContext;
    use crate::operation::Operation;

    #[derive(Debug, Clone, PartialEq)]
    struct Greet;
    impl Event for Greet {
        fn name(&self) -> &'static str {
            Self::NAME
        }
    }
    impl CommandEvent for Greet {
        const NAME: &'static str = "Greet";
    }
    struct GreetHandler;
    impl CommandHandler for GreetHandler {
        type Command = Greet;
        type Output = ();
        async fn execute(&self, _: Greet, _: &ExecutionContext) -> DomainResult {
            Ok(())
        }
    }

    #[derive(Debug, Clone, PartialEq)]
    struct Wave;
    impl Event for Wave {
        fn name(&self) -> &'static str {
            Self::NAME
        }
    }
    impl CommandEvent for Wave {
        const NAME: &'static str = "Wave";
    }
    struct WaveHandler;
    impl CommandHandler for WaveHandler {
        type Command = Wave;
        type Output = ();
        async fn execute(&self, _: Wave, _: &ExecutionContext) -> DomainResult {
            Ok(())
        }
    }
    struct BowHandler;
    impl CommandHandler for BowHandler {
        type Command = Wave;
        type Output = ();
        async fn execute(&self, _: Wave, _: &ExecutionContext) -> DomainResult {
            Ok(())
        }
    }

    struct CountGreetings(u32);
    impl QueryHandler for CountGreetings {
        type Params = ();
        type Output = u32;
        async fn execute(&self, _: (), _: &ExecutionContext) -> DomainResult<u32> {
            Ok(self.0)
        }
    }

    #[derive(Default)]
    struct SubscribingBus(Mutex<Vec<&'static str>>);
    impl EventBus for SubscribingBus {
        fn connect(&self) -> BoxFuture<'_, ()> {
            Box::pin(async {})
        }
        fn publish(&self, _: Arc<dyn AnyEvent>, _: ExecutionContext) -> BoxFuture<'_, Operation> {
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
            queries: vec![query(CountGreetings(3))],
            domain_events: vec![],
            integration_events: vec![],
        })
    }

    #[test]
    fn finds_a_command_handler_and_a_query_handler_by_their_type() {
        let module = a_module();
        let _: &GreetHandler = module.command::<GreetHandler>();
        assert_eq!(module.query::<CountGreetings>().0, 3);
    }

    #[test]
    #[should_panic(expected = "Missing command handler BowHandler in module Greetings")]
    fn names_what_is_missing() {
        a_module().command::<BowHandler>();
    }

    #[test]
    fn subscribes_every_handler_to_its_event_name() {
        let bus = SubscribingBus::default();

        pollster::block_on(a_module().subscribe(&bus));

        assert_eq!(*bus.0.lock().unwrap(), ["Greet", "Wave"]);
        assert_eq!(a_module().channels(), ["Greet", "Wave"]);
    }
}
