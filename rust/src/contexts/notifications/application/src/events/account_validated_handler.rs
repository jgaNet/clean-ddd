//! Anti-corruption layer towards Security: a validated account is welcomed by email.

use std::sync::Arc;

use architecture_application::{EventHandler, ExecutionContext};
use architecture_domain::DomainResult;
use notifications_domain::notification::ports::notification_repository::NotificationRepository;
use notifications_domain::notification::{Channel, Metadata, NewNotification};
use shared_kernel_application::integration_events::account_integration_events::AccountIntegrationEvent;

use crate::delivery::NotificationDelivery;

pub struct AccountValidatedHandler<R> {
    delivery: Arc<NotificationDelivery<R>>,
}

impl<R> AccountValidatedHandler<R> {
    pub fn new(delivery: Arc<NotificationDelivery<R>>) -> Self {
        Self { delivery }
    }
}

impl<R: NotificationRepository + Send + Sync + 'static> EventHandler for AccountValidatedHandler<R> {
    type Event = AccountIntegrationEvent;

    async fn execute(&self, event: AccountIntegrationEvent, context: &ExecutionContext) -> DomainResult {
        let AccountIntegrationEvent::Validated { account_id, email } = event else { return Ok(()) };
        self.delivery
            .deliver(
                NewNotification {
                    recipient_id: account_id,
                    title: "Welcome! Your account is now active".into(),
                    content: "<p>Your account has been verified. You now have full access to the platform.</p>\
                              <p>Thank you for joining us!</p>"
                        .into(),
                    channels: vec![Channel::Email],
                    metadata: Metadata::from([
                        ("email".to_string(), email),
                        ("source".to_string(), "Security.AccountValidated".to_string()),
                    ]),
                },
                context,
            )
            .await?;
        Ok(())
    }
}
