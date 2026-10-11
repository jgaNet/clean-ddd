//! `EventBus`: publishes events and routes them to the handlers subscribed to their name.
//!
//! Publishing returns an [`Operation`]: a handle on the processing of that event, which the
//! Tracker context records so a client can poll it. An event travels type-erased, as an
//! [`AnyEvent`], because one bus carries every kind of message; the typed handler that receives
//! it gets its own type back by downcasting, which is what [`CommandSubscriber`] and
//! [`EventSubscriber`] do, once, for every handler.
//!
//! Implementations: the in-memory bus of the building blocks' Infrastructure (a process-local
//! router) and, later, the Tracker context's decorator that records every operation.
//!
//! [`CommandSubscriber`]: crate::command_handler::CommandSubscriber
//! [`EventSubscriber`]: crate::event_handler::EventSubscriber

use std::any::Any;
use std::fmt;
use std::sync::Arc;

use architecture_domain::Event;

use crate::BoxFuture;
use crate::execution_context::ExecutionContext;
use crate::operation::Operation;

/// An event as the bus sees it: a name to route on, and a value a handler can downcast.
pub trait AnyEvent: Any + Send + Sync + fmt::Debug {
    fn name(&self) -> &'static str;
    fn as_any(&self) -> &dyn Any;
}

impl<T: Event + Send + Sync + 'static> AnyEvent for T {
    fn name(&self) -> &'static str {
        <T as Event>::name(self)
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

    /// Publishes an event, carrying the caller's context to the handlers, and answers with the
    /// operation tracking it.
    fn publish(&self, event: Arc<dyn AnyEvent>, context: ExecutionContext) -> BoxFuture<'_, Operation>;

    /// Subscribes a handler to a channel: the name of the event it reacts to.
    fn subscribe(&self, channel: &'static str, handler: Arc<dyn AnyHandler>) -> BoxFuture<'_, ()>;
}
