//! Domain exceptions of the `Notification` aggregate: a broken business rule, in business words.

use architecture_domain::Exception;

use super::channel::Channel;

/// The context that refuses.
pub const SERVICE: &str = "Notifications";

pub const BLANK_NOTIFICATION_TITLE: &str = "BlankNotificationTitle";
pub const BLANK_NOTIFICATION_CONTENT: &str = "BlankNotificationContent";
pub const EMPTY_DELIVERY_STRATEGY: &str = "EmptyDeliveryStrategy";
pub const NOTIFICATION_NOT_FOUND: &str = "NotificationNotFound";
pub const NOT_NOTIFICATION_RECIPIENT: &str = "NotNotificationRecipient";
pub const NOTIFICATION_NOT_DELIVERED: &str = "NotificationNotDelivered";
pub const NOTIFICATION_ALREADY_READ: &str = "NotificationAlreadyRead";
pub const CHANNEL_ALREADY_TRIED: &str = "ChannelAlreadyTried";

fn refusal(kind: &str, message: &str) -> Exception {
    Exception::new(SERVICE, kind, message)
}

pub fn blank_notification_title() -> Exception {
    refusal(BLANK_NOTIFICATION_TITLE, "A notification needs a title")
}

pub fn blank_notification_content() -> Exception {
    refusal(BLANK_NOTIFICATION_CONTENT, "A notification needs a content")
}

pub fn empty_delivery_strategy() -> Exception {
    refusal(EMPTY_DELIVERY_STRATEGY, "A notification needs at least one channel")
}

pub fn notification_not_found(notification_id: &str) -> Exception {
    refusal(NOTIFICATION_NOT_FOUND, "Notification not found").with("notificationId", notification_id)
}

pub fn not_notification_recipient(notification_id: &str, actor_id: &str) -> Exception {
    refusal(NOT_NOTIFICATION_RECIPIENT, "Only the recipient of a notification can read it")
        .with("notificationId", notification_id)
        .with("actorId", actor_id)
}

pub fn notification_not_delivered(notification_id: &str) -> Exception {
    refusal(NOTIFICATION_NOT_DELIVERED, "A notification can only be read once it was delivered")
        .with("notificationId", notification_id)
}

pub fn notification_already_read(notification_id: &str) -> Exception {
    refusal(NOTIFICATION_ALREADY_READ, "This notification was already read").with("notificationId", notification_id)
}

pub fn channel_already_tried(notification_id: &str, channel: Channel) -> Exception {
    refusal(CHANNEL_ALREADY_TRIED, "This channel was already tried for this notification")
        .with("notificationId", notification_id)
        .with("channel", channel.as_str())
}
