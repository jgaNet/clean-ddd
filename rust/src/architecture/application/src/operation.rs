//! `Operation`: the handle a client gets for a message on the bus — its status and its outcome.
//! The bus creates one `Pending` when an event is published; the handler marks it `Success`
//! (a command, with its value), `Sent` (a reaction) or `Error` (a refusal, or a panic the
//! safety net caught). The Tracker records one for every message, events included.

use std::any::Any;
use std::fmt;
use std::sync::Arc;
use std::time::SystemTime;

use architecture_domain::{Exception, Id};

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

/// What a command answers with: any value, which a reader downcasts (`operation.value::<String>()`).
pub type OperationValue = Arc<dyn Any + Send + Sync>;

#[derive(Clone)]
pub struct Operation {
    id: String,
    status: OperationStatus,
    event: Arc<dyn AnyEvent>,
    context: ExecutionContext,
    created_at: SystemTime,
    finished_at: Option<SystemTime>,
    result: Option<Result<OperationValue, Exception>>,
}

impl Operation {
    /// A pending operation for an event just published; the bus is the usual caller.
    pub fn new(event: Arc<dyn AnyEvent>, context: ExecutionContext) -> Self {
        Self {
            id: Id::generate().value().to_string(),
            status: OperationStatus::Pending,
            event,
            context,
            created_at: SystemTime::now(),
            finished_at: None,
            result: None,
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

    /// The command's answer, as the type it answered with.
    pub fn value<T: 'static>(&self) -> Option<&T> {
        match &self.result {
            Some(Ok(value)) => value.downcast_ref::<T>(),
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
