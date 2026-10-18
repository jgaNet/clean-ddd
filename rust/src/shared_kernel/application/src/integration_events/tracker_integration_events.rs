//! The published contract of the Tracker context: a command an authenticated caller sent has
//! reached its outcome. Published by the Tracker's bus decorator, once per command; the
//! Notifications context turns it into a notice to that caller.

use architecture_domain::{Event, EventKind, IntegrationEvent};

#[derive(Debug, Clone, PartialEq)]
pub struct OperationCompleteIntegrationEvent {
    pub operation_id: String,
    pub user_id: String,
    /// `SUCCESS` or `ERROR`: the outcome, in the operation's words.
    pub status: String,
    /// The command's name.
    pub kind: String,
    pub result: Option<serde_json::Value>,
    pub error: Option<String>,
}

impl OperationCompleteIntegrationEvent {
    pub const NAME: &'static str = "OperationCompleteIntegrationEvent";
}

impl Event for OperationCompleteIntegrationEvent {
    fn name(&self) -> &'static str {
        Self::NAME
    }

    fn kind(&self) -> EventKind {
        EventKind::Integration
    }
}

impl IntegrationEvent for OperationCompleteIntegrationEvent {}
