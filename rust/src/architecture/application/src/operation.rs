//! `Operation`: the handle a client gets for a message on the bus — its status and its outcome.
//! `publish()` creates one `Pending` and dispatches it; the handler marks it `Success` (a
//! command, with its value), `Sent` (a reaction) or `Error` (a refusal, or a panic the safety
//! net caught). The Tracker records one for every message, events included, and shows a client
//! the value as JSON: that is why a command's answer is [`AnyValue`], a value that can be both
//! downcast by the code that knows its type and serialized by the code that does not.

use std::any::Any;
use std::fmt;
use std::sync::Arc;
use std::time::SystemTime;

use architecture_domain::{Exception, Id};
use serde::Serialize;

use crate::event_bus::AnyEvent;
use crate::execution_context::ExecutionContext;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OperationStatus {
    Pending,
    Success,
    Sent,
    Error,
}

impl OperationStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            OperationStatus::Pending => "PENDING",
            OperationStatus::Success => "SUCCESS",
            OperationStatus::Sent => "SENT",
            OperationStatus::Error => "ERROR",
        }
    }
}

/// A command's answer as the operation holds it: downcast by whoever knows the type
/// (`operation.value::<String>()`), serialized by whoever does not (the Tracker's record).
pub trait AnyValue: Any + Send + Sync {
    fn as_any(&self) -> &dyn Any;
    fn to_json(&self) -> serde_json::Value;
}

impl<T: Serialize + Any + Send + Sync> AnyValue for T {
    fn as_any(&self) -> &dyn Any {
        self
    }

    fn to_json(&self) -> serde_json::Value {
        serde_json::to_value(self).unwrap_or(serde_json::Value::Null)
    }
}

/// What a command answers with.
pub type OperationValue = Arc<dyn AnyValue>;

#[derive(Clone)]
pub struct Operation {
    id: String,
    status: OperationStatus,
    event: Arc<dyn AnyEvent>,
    context: ExecutionContext,
    created_at: SystemTime,
    finished_at: Option<SystemTime>,
    result: Option<Result<OperationValue, Exception>>,
    delivered: Option<bool>,
}

impl Operation {
    /// A pending operation for an event just published; the bus is the usual caller.
    pub fn new(event: Arc<dyn AnyEvent>, context: ExecutionContext) -> Self {
        Self::with_id(Id::generate().value().to_string(), event, context)
    }

    /// A pending operation under a given id: a message relayed from the outbox carries its
    /// entry's id, so that a subscriber that already handled it is not handed it again (ADR 24).
    pub fn with_id(id: String, event: Arc<dyn AnyEvent>, context: ExecutionContext) -> Self {
        Self {
            id,
            status: OperationStatus::Pending,
            event,
            context,
            created_at: SystemTime::now(),
            finished_at: None,
            result: None,
            delivered: None,
        }
    }

    pub fn id(&self) -> &str {
        &self.id
    }

    pub fn status(&self) -> OperationStatus {
        self.status
    }

    pub fn event(&self) -> &Arc<dyn AnyEvent> {
        &self.event
    }

    /// The event, as the type the handler expects; nothing when another event came down this channel.
    pub fn event_as<E: 'static>(&self) -> Option<&E> {
        self.event.as_any().downcast_ref::<E>()
    }

    pub fn context(&self) -> &ExecutionContext {
        &self.context
    }

    pub fn created_at(&self) -> SystemTime {
        self.created_at
    }

    pub fn finished_at(&self) -> Option<SystemTime> {
        self.finished_at
    }

    pub fn result(&self) -> Option<&Result<OperationValue, Exception>> {
        self.result.as_ref()
    }

    /// The refusal, when the operation failed.
    pub fn error(&self) -> Option<&Exception> {
        match &self.result {
            Some(Err(exception)) => Some(exception),
            _ => None,
        }
    }

    /// Whether every subscriber the message reached has finished with it and succeeded (or had
    /// handled it before): `Some(false)` when one of them failed. The outbox's relay acknowledges
    /// an entry on it (ADR 24): a fact whose reactions have not all committed is still owed. The
    /// status cannot say it, since one operation is shared by every subscriber and its status is
    /// how the last of them ended. `None` when the bus cannot tell, and the relay acknowledges
    /// once the dispatch returns.
    pub fn delivered(&self) -> Option<bool> {
        self.delivered
    }

    /// The command's answer, as the type it answered with.
    pub fn value<T: 'static>(&self) -> Option<&T> {
        match &self.result {
            Some(Ok(value)) => value.as_any().downcast_ref::<T>(),
            _ => None,
        }
    }

    /// The command's answer as a client may see it; `None` while pending or failed.
    pub fn value_as_json(&self) -> Option<serde_json::Value> {
        match &self.result {
            Some(Ok(value)) => Some(value.to_json()),
            _ => None,
        }
    }

    pub fn failed(mut self, error: Exception) -> Self {
        self.status = OperationStatus::Error;
        self.result = Some(Err(error));
        self.finished_at = Some(SystemTime::now());
        self
    }

    pub fn success(mut self, value: OperationValue) -> Self {
        self.status = OperationStatus::Success;
        self.result = Some(Ok(value));
        self.finished_at = Some(SystemTime::now());
        self
    }

    pub fn sent(mut self) -> Self {
        self.status = OperationStatus::Sent;
        self
    }

    /// The bus's verdict once every subscriber has finished: whether each one succeeded.
    pub fn with_delivery(mut self, every_one_succeeded: bool) -> Self {
        self.delivered = Some(every_one_succeeded);
        self
    }
}

impl fmt::Debug for Operation {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("Operation")
            .field("id", &self.id)
            .field("status", &self.status)
            .field("event", &self.event.name())
            .field("error", &self.error())
            .finish()
    }
}
