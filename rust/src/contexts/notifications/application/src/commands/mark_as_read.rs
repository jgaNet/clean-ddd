//! The recipient opens a notification. Who may is the aggregate's rule.

use std::sync::Arc;

use architecture_application::{CommandHandler, ExecutionContext, publish_domain_events};
use architecture_domain::{CommandEvent, DomainResult, Event, EventKind};
use notifications_domain::notification::notification_exceptions::notification_not_found;
use notifications_domain::notification::ports::notification_repository::NotificationRepository;
use shared_kernel_application::require_signed_in;

use crate::SERVICE;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MarkAsRead {
    pub notification_id: String,
}

impl Event for MarkAsRead {
    fn name(&self) -> &'static str {
        Self::NAME
    }

    fn kind(&self) -> EventKind {
        EventKind::Command
    }
}

impl CommandEvent for MarkAsRead {
    const NAME: &'static str = "MarkAsReadNotification";
    type Output = ();
}

pub struct MarkAsReadCommandHandler<R> {
    notifications: Arc<R>,
}

impl<R> MarkAsReadCommandHandler<R> {
    pub fn new(notifications: Arc<R>) -> Self {
        Self { notifications }
    }
}

impl<R: NotificationRepository + Send + Sync + 'static> CommandHandler for MarkAsReadCommandHandler<R> {
    type Command = MarkAsRead;

    async fn execute(&self, command: MarkAsRead, context: &ExecutionContext) -> DomainResult {
        let reader = require_signed_in(context, SERVICE)?;

        let Some(mut notification) = self.notifications.find_by_id(&command.notification_id).await else {
            return Err(notification_not_found(&command.notification_id));
        };
        notification.mark_read(&reader)?;

        self.notifications.save(&notification).await?;
        publish_domain_events(notification, context).await;
        Ok(())
    }
}
