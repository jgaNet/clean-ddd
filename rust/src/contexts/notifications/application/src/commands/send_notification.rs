//! A notification sent by hand, by an administrator. Reactions to other contexts do not go
//! through it: they call the delivery service directly.

use std::sync::Arc;

use architecture_application::{CommandHandler, ExecutionContext};
use architecture_domain::{CommandEvent, DomainResult, Event, EventKind, Exception};
use notifications_domain::notification::ports::notification_repository::NotificationRepository;
use notifications_domain::notification::{Channel, Metadata, NewNotification};
use shared_kernel_domain::Role;

use crate::SERVICE;
use crate::delivery::NotificationDelivery;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SendNotification {
    pub recipient_id: String,
    pub title: String,
    pub content: String,
    /// The names a client sent: the domain refuses one it does not know.
    pub channels: Vec<String>,
    pub metadata: Metadata,
}

impl Event for SendNotification {
    fn name(&self) -> &'static str {
        Self::NAME
    }

    fn kind(&self) -> EventKind {
        EventKind::Command
    }
}

impl CommandEvent for SendNotification {
    const NAME: &'static str = "SendNotification";
    /// The id of the notification.
    type Output = String;
}

pub struct SendNotificationCommandHandler<R> {
    delivery: Arc<NotificationDelivery<R>>,
}

impl<R> SendNotificationCommandHandler<R> {
    pub fn new(delivery: Arc<NotificationDelivery<R>>) -> Self {
        Self { delivery }
    }
}

impl<R: NotificationRepository + Send + Sync + 'static> CommandHandler for SendNotificationCommandHandler<R> {
    type Command = SendNotification;

    async fn guard(&self, _: &SendNotification, context: &ExecutionContext) -> DomainResult {
        if context.auth().role.as_deref() != Some(Role::Admin.as_str()) {
            return Err(Exception::not_allowed(SERVICE, "Only administrators can send notifications by hand"));
        }
        Ok(())
    }

    async fn execute(&self, command: SendNotification, context: &ExecutionContext) -> DomainResult<String> {
        let channels = Channel::parse_all(&command.channels)?;
        self.delivery
            .deliver(
                NewNotification {
                    recipient_id: command.recipient_id,
                    title: command.title,
                    content: command.content,
                    channels,
                    metadata: command.metadata,
                },
                context,
            )
            .await
    }
}
