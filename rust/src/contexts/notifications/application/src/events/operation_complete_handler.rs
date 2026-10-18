//! Anti-corruption layer towards Tracker: the caller of an asynchronous command learns how it
//! went, live, over the websocket. Only the outcomes are worth a notification.

use std::sync::Arc;

use architecture_application::{EventHandler, ExecutionContext};
use architecture_domain::DomainResult;
use notifications_domain::notification::ports::notification_repository::NotificationRepository;
use notifications_domain::notification::{Channel, Metadata, NewNotification};
use shared_kernel_application::integration_events::tracker_integration_events::OperationCompleteIntegrationEvent;

use crate::delivery::NotificationDelivery;

pub struct OperationCompleteHandler<R> {
    delivery: Arc<NotificationDelivery<R>>,
}

impl<R> OperationCompleteHandler<R> {
    pub fn new(delivery: Arc<NotificationDelivery<R>>) -> Self {
        Self { delivery }
    }
}

impl<R: NotificationRepository + Send + Sync + 'static> EventHandler for OperationCompleteHandler<R> {
    type Event = OperationCompleteIntegrationEvent;

    async fn execute(&self, event: OperationCompleteIntegrationEvent, context: &ExecutionContext) -> DomainResult {
        let OperationCompleteIntegrationEvent { operation_id, user_id, status, kind, result, error } = event;
        let (title, content) = match status.as_str() {
            "SUCCESS" => (format!("Operation complete: {kind}"), format!("Your operation {operation_id} succeeded.")),
            "ERROR" => (
                format!("Operation failed: {kind}"),
                format!("Your operation {operation_id} failed: {}", error.as_deref().unwrap_or("unknown error")),
            ),
            _ => return Ok(()), // not an outcome (PENDING, SENT): nothing to tell the user yet
        };
        let mut metadata = Metadata::from([
            ("operationId".to_string(), operation_id),
            ("type".to_string(), kind),
            ("status".to_string(), status),
        ]);
        if let Some(result) = result {
            metadata.insert("result".into(), result.to_string());
        }
        if let Some(error) = error {
            metadata.insert("error".into(), error);
        }
        self.delivery
            .deliver(
                NewNotification { recipient_id: user_id, title, content, channels: vec![Channel::WebSocket], metadata },
                context,
            )
            .await?;
        Ok(())
    }
}
