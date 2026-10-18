//! `EventBus`: publishes events and routes them to the handlers subscribed to their name.
//!
//! Publishing answers with an [`Operation`]: a handle on the processing of that event, which the
//! Tracker context records so a client can poll it. The operation exists before the handling
//! starts — `publish()` builds it and hands it to `dispatch()` — so a transport can answer
//! `202 { operationId }` at once and let the dispatch run on its runtime (ADR 14). An event
//! travels type-erased, as an [`AnyEvent`], because one bus carries every kind of message; the
//! typed handler that receives it gets its own type back by downcasting, which is what
//! [`CommandSubscriber`] and [`EventSubscriber`] do, once, for every handler.
//!
//! Implementations: the in-memory bus of the building blocks' Infrastructure (a process-local
//! router) and the Tracker context's decorator that records every operation.
//!
//! [`CommandSubscriber`]: crate::command_handler::CommandSubscriber
//! [`EventSubscriber`]: crate::event_handler::EventSubscriber

use std::any::Any;
use std::fmt;
use std::sync::Arc;

use architecture_domain::{Event, EventKind};

use crate::BoxFuture;
use crate::execution_context::ExecutionContext;
use crate::operation::Operation;

/// An event as the bus sees it: a name to route on, and a value a handler can downcast.
pub trait AnyEvent: Any + Send + Sync + fmt::Debug {
    fn name(&self) -> &'static str;
    fn kind(&self) -> EventKind;
    fn as_any(&self) -> &dyn Any;
}

impl<T: Event + Send + Sync + 'static> AnyEvent for T {
    fn name(&self) -> &'static str {
        <T as Event>::name(self)
    }

    fn kind(&self) -> EventKind {
        <T as Event>::kind(self)
    }

    fn as_any(&self) -> &dyn Any {
        self
    }
}

/// A handler as the bus sees it: it takes an operation and gives it back, marked.
pub trait AnyHandler: Any + Send + Sync {
    fn handle(&self, operation: Operation) -> BoxFuture<'_, Operation>;
    fn as_any(&self) -> &dyn Any;
}

pub trait EventBus: Send + Sync {
    /// Connects to the event infrastructure, if there is one to connect to.
    fn connect(&self) -> BoxFuture<'_, ()>;

    /// Hands a pending operation to the handlers of its event's name and answers with the
    /// operation as they left it. What an implementation writes; what a transport that has
    /// already answered with the operation's id spawns.
    fn dispatch(&self, operation: Operation) -> BoxFuture<'_, Operation>;

    /// Publishes an event, carrying the caller's context to the handlers, and answers with the
    /// operation tracking it: a new pending operation, dispatched. What a handler calls.
    fn publish(&self, event: Arc<dyn AnyEvent>, context: ExecutionContext) -> BoxFuture<'_, Operation> {
        self.dispatch(Operation::new(event, context))
    }

    /// Subscribes a handler to a channel: the name of the event it reacts to.
    fn subscribe(&self, channel: &'static str, handler: Arc<dyn AnyHandler>) -> BoxFuture<'_, ()>;
}
