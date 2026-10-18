//! Anti-corruption layer towards Security: a new account gets its validation link by email.

use std::sync::Arc;

use architecture_application::{EventHandler, ExecutionContext};
use architecture_domain::DomainResult;
use notifications_domain::notification::ports::notification_repository::NotificationRepository;
use notifications_domain::notification::{Channel, Metadata, NewNotification};
use shared_kernel_application::integration_events::account_integration_events::AccountIntegrationEvent;

use crate::delivery::NotificationDelivery;

pub struct AccountCreatedHandler<R> {
    /// The application's public URL, which the validation link is built on.
    url: String,
    delivery: Arc<NotificationDelivery<R>>,
}

impl<R> AccountCreatedHandler<R> {
    pub fn new(url: &str, delivery: Arc<NotificationDelivery<R>>) -> Self {
        Self { url: url.into(), delivery }
    }
}

impl<R: NotificationRepository + Send + Sync + 'static> EventHandler for AccountCreatedHandler<R> {
    type Event = AccountIntegrationEvent;

    async fn execute(&self, event: AccountIntegrationEvent, context: &ExecutionContext) -> DomainResult {
        let AccountIntegrationEvent::Created { account_id, email, validation_token } = event else { return Ok(()) };
        let link = format!("{}/auth/validate?validation_token={validation_token}", self.url);
        self.delivery
            .deliver(
                NewNotification {
                    recipient_id: account_id,
                    title: "Welcome - verify your account".into(),
                    content: format!(
                        "<p>Thank you for creating an account!</p>\
                         <p>Please verify it by clicking on the link below:</p>\
                         <p><a href=\"{link}\">Verify your account</a></p>\
                         <p>This link will expire in 24 hours.</p>"
                    ),
                    channels: vec![Channel::Email],
                    metadata: Metadata::from([
                        ("email".to_string(), email),
                        ("source".to_string(), "Security.AccountCreated".to_string()),
                    ]),
                },
                context,
            )
            .await?;
        Ok(())
    }
}
