//! The mechanics of a use case: handlers, the execution context, the event bus, operations,
//! modules and the application that starts them. No business rule and no project vocabulary
//! lives here (`require_signed_in`, which knows the roles, is in the shared kernel).
//!
//! Where the TypeScript handlers are base classes with a template method, these are traits with
//! a provided `handle()` that does the guard, the transaction and the safety net once, and an
//! `execute()` each concrete handler writes. The bus routes type-erased events by name and a
//! typed handler gets its own event back; the execution context is shared by `Arc`, so that
//! what is deferred until the commit can still publish on the same bus with the same context.

pub mod application;
pub mod command_handler;
pub mod domain_events;
pub mod event_bus;
pub mod event_handler;
pub mod execution_context;
pub mod module;
pub mod operation;
pub mod outbox;
pub mod query_handler;

use std::future::Future;
use std::pin::Pin;

/// A boxed future, which is what a port used through `dyn` hands out.
pub type BoxFuture<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;

pub use application::Application;
pub use command_handler::{AnyCommand, CommandHandler, CommandSubscriber};
pub use domain_events::publish_domain_events;
pub use event_bus::{AnyEvent, AnyHandler, EventBus};
pub use event_handler::{EventHandler, EventSubscriber};
pub use execution_context::{Auth, ExecutionContext, ExecutionContextOptions, Logger, UnitOfWork};
pub use module::{Module, ModuleDefinition, QueryEntry, Subscription, query};
pub use operation::{AnyValue, Operation, OperationStatus, OperationValue};
pub use outbox::{Outbox, OutboxEntry, relay_outbox};
pub use query_handler::{AnyQuery, Query, QueryHandler};
