//! `Notification` is the aggregate root of the Notifications context: something to tell one
//! account, and the story of how it was delivered.
//!
//! - it always has a title, a content and a non-empty delivery strategy
//! - each channel is tried at most once; the attempts are child entities ([`DeliveryAttempt`])
//! - the first channel that accepts it makes it `Sent`; when none is left it is `Failed`
//! - only its recipient can mark it read, and only once it was delivered
//!
//! Talking to a channel is not the aggregate's job (see the `NotificationChannel` port and the
//! `NotificationDelivery` application service); recording what happened is.

pub mod channel;
pub mod delivery_attempt;
pub mod delivery_strategy;
pub mod dtos;
pub mod events;
pub mod notification_exceptions;
pub mod notification_status;
pub mod ports;

use std::collections::BTreeMap;
use std::time::SystemTime;

use architecture_domain::{Aggregate, AggregateRoot, DomainResult, Entity, Id};

pub use channel::Channel;
pub use delivery_attempt::DeliveryAttempt;
pub use delivery_strategy::DeliveryStrategy;
pub use dtos::{NewNotification, NotificationSnapshot};
pub use events::NotificationEvent;
pub use notification_status::NotificationStatus;

use notification_exceptions::{
    blank_notification_content, blank_notification_title, channel_already_tried, not_notification_recipient,
    notification_already_read, notification_not_delivered,
};

/// Whatever a channel may need that is not the notification itself (an email address, a source).
pub type Metadata = BTreeMap<String, String>;

#[derive(Debug)]
pub struct Notification {
    root: AggregateRoot<NotificationEvent>,
    recipient_id: Id,
    title: String,
    content: String,
    strategy: DeliveryStrategy,
    status: NotificationStatus,
    created_at: SystemTime,
    sent_at: Option<SystemTime>,
    read_at: Option<SystemTime>,
    delivered_via: Option<Channel>,
    metadata: Metadata,
    attempts: Vec<DeliveryAttempt>,
}

impl Entity for Notification {
    fn id(&self) -> &Id {
        self.root.id()
    }
}

impl Aggregate for Notification {
    type Event = NotificationEvent;

    fn pull_domain_events(&mut self) -> Vec<NotificationEvent> {
        self.root.pull_domain_events()
    }
}

impl Notification {
    /// Writes a brand new notification, now. Nothing is recorded yet: the fact is its delivery.
    pub fn create(props: NewNotification) -> DomainResult<Notification> {
        Self::create_at(props, SystemTime::now())
    }

    /// Time is a parameter, with `create()` as its default.
    pub fn create_at(props: NewNotification, now: SystemTime) -> DomainResult<Notification> {
        let title = props.title.trim();
        if title.is_empty() {
            return Err(blank_notification_title());
        }
        let content = props.content.trim();
        if content.is_empty() {
            return Err(blank_notification_content());
        }
        let strategy = DeliveryStrategy::create(&props.channels)?;

        Ok(Notification {
            root: AggregateRoot::new(Id::generate(), 0),
            recipient_id: Id::new(props.recipient_id),
            title: title.to_string(),
            content: content.to_string(),
            strategy,
            status: NotificationStatus::Pending,
            created_at: now,
            sent_at: None,
            read_at: None,
            delivered_via: None,
            metadata: props.metadata,
            attempts: Vec::new(),
        })
    }

    /// Rebuilds a `Notification`, attempts included, from what was persisted. No event is recorded.
    ///
    /// # Panics
    ///
    /// On a snapshot that breaks a rule of the aggregate: corrupted storage (ADR 4).
    pub fn from_snapshot(snapshot: NotificationSnapshot) -> Notification {
        let strategy = DeliveryStrategy::create(&snapshot.channels)
            .unwrap_or_else(|refusal| panic!("Corrupted notification {}: {}", snapshot.id, refusal.message()));
        assert!(
            !snapshot.title.trim().is_empty() && !snapshot.content.trim().is_empty(),
            "Corrupted notification {}: blank title or content",
            snapshot.id
        );
        Notification {
            root: AggregateRoot::new(Id::new(snapshot.id), snapshot.version),
            recipient_id: Id::new(snapshot.recipient_id),
            title: snapshot.title,
            content: snapshot.content,
            strategy,
            status: snapshot.status,
            created_at: snapshot.created_at,
            sent_at: snapshot.sent_at,
            read_at: snapshot.read_at,
            delivered_via: snapshot.delivered_via,
            metadata: snapshot.metadata,
            attempts: snapshot.attempts.into_iter().map(DeliveryAttempt::from_snapshot).collect(),
        }
    }

    /// The channels of the strategy not tried yet, in order. Empty once delivered or exhausted.
    pub fn channels_to_try(&self) -> Vec<Channel> {
        if self.status != NotificationStatus::Pending {
            return Vec::new();
        }
        self.strategy
            .channels()
            .iter()
            .copied()
            .filter(|channel| !self.attempts.iter().any(|attempt| attempt.channel() == *channel))
            .collect()
    }

    /// Records what a channel answered, now. A success delivers the notification; the last failure fails it.
    pub fn record_attempt(&mut self, channel: Channel, succeeded: bool) -> DomainResult {
        self.record_attempt_at(channel, succeeded, SystemTime::now())
    }

    pub fn record_attempt_at(&mut self, channel: Channel, succeeded: bool, at: SystemTime) -> DomainResult {
        if self.attempts.iter().any(|attempt| attempt.channel() == channel) {
            return Err(channel_already_tried(self.id().value(), channel));
        }

        self.attempts.push(DeliveryAttempt::create(channel, succeeded, at));

        if succeeded {
            self.status = NotificationStatus::Sent;
            self.sent_at = Some(at);
            self.delivered_via = Some(channel);
            self.root.record(NotificationEvent::Sent {
                notification_id: self.id().value().to_string(),
                recipient_id: self.recipient_id.value().to_string(),
                via: channel,
            });
        } else if self.channels_to_try().is_empty() {
            self.status = NotificationStatus::Failed;
            self.root.record(NotificationEvent::Failed {
                notification_id: self.id().value().to_string(),
                recipient_id: self.recipient_id.value().to_string(),
            });
        }
        Ok(())
    }

    pub fn mark_read(&mut self, actor_id: &Id) -> DomainResult {
        self.mark_read_at(actor_id, SystemTime::now())
    }

    pub fn mark_read_at(&mut self, actor_id: &Id, at: SystemTime) -> DomainResult {
        if &self.recipient_id != actor_id {
            return Err(not_notification_recipient(self.id().value(), actor_id.value()));
        }
        if self.status == NotificationStatus::Read {
            return Err(notification_already_read(self.id().value()));
        }
        if self.status != NotificationStatus::Sent {
            return Err(notification_not_delivered(self.id().value()));
        }

        self.status = NotificationStatus::Read;
        self.read_at = Some(at);
        self.root.record(NotificationEvent::Read {
            notification_id: self.id().value().to_string(),
            recipient_id: self.recipient_id.value().to_string(),
        });
        Ok(())
    }

    pub fn to_snapshot(&self) -> NotificationSnapshot {
        NotificationSnapshot {
            id: self.id().value().to_string(),
            recipient_id: self.recipient_id.value().to_string(),
            title: self.title.clone(),
            content: self.content.clone(),
            channels: self.strategy.channels().to_vec(),
            status: self.status,
            created_at: self.created_at,
            sent_at: self.sent_at,
            read_at: self.read_at,
            delivered_via: self.delivered_via,
            metadata: self.metadata.clone(),
            attempts: self.attempts.iter().map(DeliveryAttempt::to_snapshot).collect(),
            version: self.root.version(),
        }
    }

    pub fn version(&self) -> u64 {
        self.root.version()
    }

    pub fn recipient_id(&self) -> &Id {
        &self.recipient_id
    }

    pub fn title(&self) -> &str {
        &self.title
    }

    pub fn content(&self) -> &str {
        &self.content
    }

    pub fn status(&self) -> NotificationStatus {
        self.status
    }

    pub fn delivered_via(&self) -> Option<Channel> {
        self.delivered_via
    }

    pub fn metadata(&self) -> &Metadata {
        &self.metadata
    }

    pub fn attempts(&self) -> &[DeliveryAttempt] {
        &self.attempts
    }
}

#[cfg(test)]
mod tests {
    use notification_exceptions::{
        BLANK_NOTIFICATION_TITLE, CHANNEL_ALREADY_TRIED, EMPTY_DELIVERY_STRATEGY, NOT_NOTIFICATION_RECIPIENT,
        NOTIFICATION_ALREADY_READ, NOTIFICATION_NOT_DELIVERED,
    };

    use super::*;

    const AT: SystemTime = SystemTime::UNIX_EPOCH;

    fn a_notification(channels: Vec<Channel>) -> Notification {
        Notification::create_at(
            NewNotification {
                recipient_id: "bob".into(),
                title: "Hello".into(),
                content: "World".into(),
                channels,
                metadata: Metadata::new(),
            },
            AT,
        )
        .expect("valid")
    }

    fn both() -> Notification {
        a_notification(vec![Channel::WebSocket, Channel::Email])
    }

    #[test]
    fn starts_pending_with_every_channel_of_the_strategy_still_to_try() {
        let mut notification = both();

        assert_eq!(notification.status(), NotificationStatus::Pending);
        assert_eq!(notification.channels_to_try(), [Channel::WebSocket, Channel::Email]);
        assert!(notification.attempts().is_empty());
        assert!(notification.pull_domain_events().is_empty());
    }

    #[test]
    fn refuses_a_blank_title_and_an_empty_strategy() {
        let blank = Notification::create(NewNotification {
            recipient_id: "bob".into(),
            title: " ".into(),
            content: "x".into(),
            channels: vec![Channel::Email],
            metadata: Metadata::new(),
        });
        let none = Notification::create(NewNotification {
            recipient_id: "bob".into(),
            title: "x".into(),
            content: "x".into(),
            channels: vec![],
            metadata: Metadata::new(),
        });

        assert!(blank.expect_err("blank").is(BLANK_NOTIFICATION_TITLE));
        assert!(none.expect_err("no channel").is(EMPTY_DELIVERY_STRATEGY));
    }

    #[test]
    fn is_sent_by_the_first_channel_that_accepts_it_and_records_the_fact() {
        let mut notification = both();

        notification.record_attempt_at(Channel::WebSocket, true, AT).expect("recorded");

        assert_eq!(notification.status(), NotificationStatus::Sent);
        assert_eq!(notification.delivered_via(), Some(Channel::WebSocket));
        assert!(notification.channels_to_try().is_empty());
        assert_eq!(
            notification.attempts().iter().map(|a| (a.channel(), a.succeeded())).collect::<Vec<_>>(),
            [(Channel::WebSocket, true)]
        );
        assert_eq!(
            notification.pull_domain_events(),
            [NotificationEvent::Sent {
                notification_id: notification.id().value().to_string(),
                recipient_id: "bob".into(),
                via: Channel::WebSocket,
            }]
        );
    }

    #[test]
    fn falls_back_to_the_next_channel_after_a_failure_and_fails_when_none_is_left() {
        let mut notification = both();

        notification.record_attempt_at(Channel::WebSocket, false, AT).expect("recorded");
        assert_eq!(notification.status(), NotificationStatus::Pending);
        assert_eq!(notification.channels_to_try(), [Channel::Email]);

        notification.record_attempt_at(Channel::Email, false, AT).expect("recorded");
        assert_eq!(notification.status(), NotificationStatus::Failed);
        assert!(notification.channels_to_try().is_empty());
        assert_eq!(
            notification.pull_domain_events(),
            [NotificationEvent::Failed {
                notification_id: notification.id().value().to_string(),
                recipient_id: "bob".into()
            }]
        );
    }

    #[test]
    fn tries_each_channel_at_most_once() {
        let mut notification = both();
        notification.record_attempt_at(Channel::WebSocket, false, AT).expect("recorded");

        let again = notification.record_attempt_at(Channel::WebSocket, true, AT);

        assert!(again.expect_err("twice").is(CHANNEL_ALREADY_TRIED));
    }

    #[test]
    fn is_read_by_its_recipient_once_delivered_and_only_once() {
        let mut notification = both();
        let (bob, carol) = (Id::new("bob"), Id::new("carol"));

        assert!(notification.mark_read_at(&bob, AT).expect_err("not delivered").is(NOTIFICATION_NOT_DELIVERED));
        notification.record_attempt_at(Channel::Email, true, AT).expect("sent");
        assert!(notification.mark_read_at(&carol, AT).expect_err("not hers").is(NOT_NOTIFICATION_RECIPIENT));
        notification.mark_read_at(&bob, AT).expect("read");
        assert!(notification.mark_read_at(&bob, AT).expect_err("again").is(NOTIFICATION_ALREADY_READ));

        assert_eq!(notification.status(), NotificationStatus::Read);
        assert_eq!(notification.pull_domain_events().len(), 2); // sent, then read
    }

    #[test]
    fn rebuilds_from_its_snapshot_attempts_included_without_recording_anything() {
        let mut notification = both();
        notification.record_attempt_at(Channel::WebSocket, false, AT).expect("recorded");
        notification.pull_domain_events();
        let snapshot = notification.to_snapshot();

        let mut rebuilt = Notification::from_snapshot(snapshot.clone());

        assert_eq!(rebuilt.to_snapshot(), snapshot);
        assert_eq!(rebuilt.channels_to_try(), [Channel::Email]);
        assert!(rebuilt.pull_domain_events().is_empty());
    }

    #[test]
    #[should_panic(expected = "Corrupted notification n1")]
    fn panics_on_a_corrupted_snapshot() {
        let mut snapshot = both().to_snapshot();
        snapshot.id = "n1".into();
        snapshot.channels.clear();
        Notification::from_snapshot(snapshot);
    }
}
