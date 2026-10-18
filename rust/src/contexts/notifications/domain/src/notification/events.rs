//! Facts recorded by the `Notification` aggregate: delivered, failed, read.

use architecture_domain::{DomainEvent, Event, EventKind};

use super::channel::Channel;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum NotificationEvent {
    Sent { notification_id: String, recipient_id: String, via: Channel },
    Failed { notification_id: String, recipient_id: String },
    Read { notification_id: String, recipient_id: String },
}

impl Event for NotificationEvent {
    fn name(&self) -> &'static str {
        match self {
            NotificationEvent::Sent { .. } => "NotificationSent",
            NotificationEvent::Failed { .. } => "NotificationFailed",
            NotificationEvent::Read { .. } => "NotificationRead",
        }
    }

    fn kind(&self) -> EventKind {
        EventKind::Domain
    }
}

impl DomainEvent for NotificationEvent {}
