//! The published contract of the Security context: an account was created and needs its email
//! validated (the token travels with the fact, so the consumer never asks Security for it), and
//! an account was validated.

use architecture_domain::{Event, EventKind, IntegrationEvent};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AccountIntegrationEvent {
    Created { account_id: String, email: String, validation_token: String },
    Validated { account_id: String, email: String },
}

impl AccountIntegrationEvent {
    pub const CREATED: &'static str = "AccountCreatedIntegrationEvent";
    pub const VALIDATED: &'static str = "AccountValidatedIntegrationEvent";
}

impl Event for AccountIntegrationEvent {
    fn name(&self) -> &'static str {
        match self {
            AccountIntegrationEvent::Created { .. } => Self::CREATED,
            AccountIntegrationEvent::Validated { .. } => Self::VALIDATED,
        }
    }

    fn kind(&self) -> EventKind {
        EventKind::Integration
    }
}

impl IntegrationEvent for AccountIntegrationEvent {}
