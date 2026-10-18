//! Facts recorded by the `Account` aggregate. They stay inside the Security context; the
//! application handlers translate the ones other contexts care about into integration events.

use std::time::SystemTime;

use architecture_domain::{DomainEvent, Event, EventKind};
use shared_kernel_domain::Role;

use super::account_status::AccountStatus;

#[derive(Debug, Clone, PartialEq)]
pub enum AccountEvent {
    Created { account_id: String, email: String, role: Role, status: AccountStatus },
    Validated { account_id: String, email: String },
    Authenticated { account_id: String, at: SystemTime },
}

impl Event for AccountEvent {
    fn name(&self) -> &'static str {
        match self {
            AccountEvent::Created { .. } => "AccountCreated",
            AccountEvent::Validated { .. } => "AccountValidated",
            AccountEvent::Authenticated { .. } => "AccountAuthenticated",
        }
    }

    fn kind(&self) -> EventKind {
        EventKind::Domain
    }
}

impl DomainEvent for AccountEvent {}
