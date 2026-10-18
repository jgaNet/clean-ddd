//! Snapshot of a `Notification`, attempts included: the aggregate is persisted as a whole.

use std::time::SystemTime;

use super::Metadata;
use super::channel::Channel;
use super::notification_status::NotificationStatus;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeliveryAttemptSnapshot {
    pub id: String,
    pub channel: Channel,
    pub at: SystemTime,
    pub succeeded: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NotificationSnapshot {
    pub id: String,
    pub recipient_id: String,
    pub title: String,
    pub content: String,
    pub channels: Vec<Channel>,
    pub status: NotificationStatus,
    pub created_at: SystemTime,
    pub sent_at: Option<SystemTime>,
    pub read_at: Option<SystemTime>,
    pub delivered_via: Option<Channel>,
    pub metadata: Metadata,
    pub attempts: Vec<DeliveryAttemptSnapshot>,
    /// The version this snapshot was read at; the repository stores version + 1 (ADR 8).
    pub version: u64,
}

/// What is needed to send a new notification.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NewNotification {
    pub recipient_id: String,
    pub title: String,
    pub content: String,
    pub channels: Vec<Channel>,
    /// Whatever a channel may need that is not the notification itself (an email address, a source).
    pub metadata: Metadata,
}
