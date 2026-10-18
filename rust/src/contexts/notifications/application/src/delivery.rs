//! The one use case every entry point of this context ends in: create the notification, try
//! its channels in order until one accepts it, keep the story. An application service because
//! it orchestrates ports and publishes events; it holds no rule of its own (the aggregate
//! decides which channel is next and when it is sent or failed).
//!
//! Called by the `SendNotification` command (manual, administrators) and by the anti-corruption
//! handlers reacting to other contexts. The channels are held through `dyn`, since a list of
//! adapters of different types is what a strategy walks.

use std::sync::Arc;

use architecture_application::{BoxFuture, ExecutionContext, publish_domain_events};
use architecture_domain::{DomainResult, Entity};
use notifications_domain::notification::ports::notification_channel::{Delivery, NotificationChannel};
use notifications_domain::notification::ports::notification_repository::NotificationRepository;
use notifications_domain::notification::{Channel, NewNotification, Notification};

/// A channel as the delivery holds it.
pub trait AnyChannel: Send + Sync {
    fn channel(&self) -> Channel;
    fn is_available_for<'a>(&'a self, recipient_id: &'a str) -> BoxFuture<'a, bool>;
    fn deliver<'a>(&'a self, delivery: &'a Delivery) -> BoxFuture<'a, Result<(), String>>;
}

impl<C: NotificationChannel + Send + Sync> AnyChannel for C {
    fn channel(&self) -> Channel {
        NotificationChannel::channel(self)
    }
    fn is_available_for<'a>(&'a self, recipient_id: &'a str) -> BoxFuture<'a, bool> {
        Box::pin(NotificationChannel::is_available_for(self, recipient_id))
    }
    fn deliver<'a>(&'a self, delivery: &'a Delivery) -> BoxFuture<'a, Result<(), String>> {
        Box::pin(NotificationChannel::deliver(self, delivery))
    }
}

pub struct NotificationDelivery<R> {
    notifications: Arc<R>,
    channels: Vec<Arc<dyn AnyChannel>>,
}

impl<R: NotificationRepository + Send + Sync> NotificationDelivery<R> {
    pub fn new(notifications: Arc<R>, channels: Vec<Arc<dyn AnyChannel>>) -> Self {
        Self { notifications, channels }
    }

    /// The id of the notification, whatever its outcome: the story is kept either way.
    pub async fn deliver(&self, props: NewNotification, context: &ExecutionContext) -> DomainResult<String> {
        let mut notification = Notification::create(props)?;
        let delivery = Delivery {
            notification_id: notification.id().value().to_string(),
            recipient_id: notification.recipient_id().value().to_string(),
            title: notification.title().to_string(),
            content: notification.content().to_string(),
            metadata: notification.metadata().clone(),
        };

        for channel in notification.channels_to_try() {
            let adapter = self.channels.iter().find(|adapter| adapter.channel() == channel);
            let outcome = match adapter {
                Some(adapter) if adapter.is_available_for(&delivery.recipient_id).await => {
                    adapter.deliver(&delivery).await
                }
                _ => Err(format!("{} unavailable", channel.as_str())),
            };
            if let (Err(reason), Some(logger)) = (&outcome, context.logger()) {
                logger.debug(
                    context.trace_id(),
                    &format!("Notification {}: {} failed ({reason})", delivery.notification_id, channel.as_str()),
                );
            }
            let succeeded = outcome.is_ok();
            notification.record_attempt(channel, succeeded)?;
            if succeeded {
                break;
            }
        }

        self.notifications.save(&notification).await?;
        publish_domain_events(notification, context).await;
        Ok(delivery.notification_id)
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use std::sync::Mutex;

    use architecture_application::{Auth, ExecutionContextOptions};
    use architecture_infrastructure::{InMemoryDataSource, InMemoryEventBus};
    use notifications_domain::notification::{Metadata, NotificationStatus};
    use notifications_infrastructure::InMemoryNotificationRepository;

    use super::*;

    /// A channel for tests: says whether it is available, accepts or refuses, and remembers what it received.
    pub(crate) struct FakeChannel {
        pub channel: Channel,
        pub available: bool,
        pub accepts: bool,
        pub delivered: Mutex<Vec<Delivery>>,
    }
    impl FakeChannel {
        pub fn new(channel: Channel) -> Arc<Self> {
            Arc::new(Self { channel, available: true, accepts: true, delivered: Mutex::new(Vec::new()) })
        }
        pub fn unavailable(channel: Channel) -> Arc<Self> {
            Arc::new(Self { channel, available: false, accepts: true, delivered: Mutex::new(Vec::new()) })
        }
        pub fn refusing(channel: Channel) -> Arc<Self> {
            Arc::new(Self { channel, available: true, accepts: false, delivered: Mutex::new(Vec::new()) })
        }
        pub fn delivered(&self) -> Vec<Delivery> {
            self.delivered.lock().unwrap().clone()
        }
    }
    impl NotificationChannel for FakeChannel {
        fn channel(&self) -> Channel {
            self.channel
        }
        async fn is_available_for(&self, _: &str) -> bool {
            self.available
        }
        async fn deliver(&self, delivery: &Delivery) -> Result<(), String> {
            self.delivered.lock().unwrap().push(delivery.clone());
            if self.accepts { Ok(()) } else { Err(format!("{} refused", self.channel.as_str())) }
        }
    }

    pub(crate) fn context() -> ExecutionContext {
        ExecutionContext::new(ExecutionContextOptions {
            trace_id: "trace".into(),
            auth: Auth::anonymous(),
            event_bus: Arc::new(InMemoryEventBus::new()),
            unit_of_work: None,
            logger: None,
        })
    }

    pub(crate) fn a_notification_for(recipient_id: &str, channels: Vec<Channel>) -> NewNotification {
        NewNotification {
            recipient_id: recipient_id.into(),
            title: "Hello".into(),
            content: "World".into(),
            channels,
            metadata: Metadata::new(),
        }
    }

    fn delivery_with(
        channels: Vec<Arc<dyn AnyChannel>>,
    ) -> (
        Arc<InMemoryDataSource<notifications_domain::notification::NotificationSnapshot>>,
        NotificationDelivery<InMemoryNotificationRepository>,
    ) {
        let store = Arc::new(InMemoryDataSource::new());
        (store.clone(), NotificationDelivery::new(Arc::new(InMemoryNotificationRepository::new(store)), channels))
    }

    #[test]
    fn tries_the_channels_in_order_until_one_accepts_and_keeps_the_story() {
        let websocket = FakeChannel::unavailable(Channel::WebSocket);
        let email = FakeChannel::new(Channel::Email);
        let (store, delivery) = delivery_with(vec![websocket.clone(), email.clone()]);

        let id = pollster::block_on(
            delivery.deliver(a_notification_for("bob", vec![Channel::WebSocket, Channel::Email]), &context()),
        )
        .expect("delivered");

        let stored = store.get(&id).expect("stored");
        assert_eq!(stored.status, NotificationStatus::Sent);
        assert_eq!(stored.delivered_via, Some(Channel::Email));
        assert_eq!(
            stored.attempts.iter().map(|a| (a.channel, a.succeeded)).collect::<Vec<_>>(),
            [(Channel::WebSocket, false), (Channel::Email, true)]
        );
        assert!(websocket.delivered().is_empty()); // not available: never asked
        assert_eq!(email.delivered()[0].recipient_id, "bob");
    }

    #[test]
    fn fails_the_notification_when_every_channel_refused_and_still_answers_its_id() {
        let email = FakeChannel::refusing(Channel::Email);
        let (store, delivery) = delivery_with(vec![email.clone()]);

        let id = pollster::block_on(delivery.deliver(a_notification_for("bob", vec![Channel::Email]), &context()))
            .expect("kept");

        assert_eq!(store.get(&id).expect("stored").status, NotificationStatus::Failed);
        assert_eq!(email.delivered().len(), 1);
    }

    #[test]
    fn a_channel_the_wiring_did_not_provide_counts_as_unavailable() {
        let (store, delivery) = delivery_with(vec![]);

        let id = pollster::block_on(delivery.deliver(a_notification_for("bob", vec![Channel::WebSocket]), &context()))
            .expect("kept");

        assert_eq!(store.get(&id).expect("stored").status, NotificationStatus::Failed);
    }
}
