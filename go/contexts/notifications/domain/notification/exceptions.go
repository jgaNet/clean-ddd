package notification

import "clean-ddd/architecture/domain"

// Domain exceptions describe a broken business rule of the Notification aggregate, in business
// words. They are values returned as errors, never panicked: a refused command is a normal
// outcome, not a crash. Each one names the rule it protects, as a PascalCase Type a client
// reads on the operation.

const Service = "Notifications"

func exception(typ, message string, context map[string]any) *domain.Exception {
	return domain.NewException(Service, typ, message, context)
}

func BlankNotificationTitle() *domain.Exception {
	return exception("BlankNotificationTitle", "A notification needs a title", nil)
}

func BlankNotificationContent() *domain.Exception {
	return exception("BlankNotificationContent", "A notification needs a content", nil)
}

func EmptyDeliveryStrategy() *domain.Exception {
	return exception("EmptyDeliveryStrategy", "A notification needs at least one channel", nil)
}

func NotificationNotFound(notificationID string) *domain.Exception {
	return exception("NotificationNotFound", "Notification not found", map[string]any{"notificationId": notificationID})
}

func NotNotificationRecipient(notificationID, actorID string) *domain.Exception {
	return exception("NotNotificationRecipient", "Only the recipient of a notification can read it",
		map[string]any{"notificationId": notificationID, "actorId": actorID})
}

func NotificationNotDelivered(notificationID string) *domain.Exception {
	return exception("NotificationNotDelivered", "A notification can only be read once it was delivered",
		map[string]any{"notificationId": notificationID})
}

func NotificationAlreadyRead(notificationID string) *domain.Exception {
	return exception("NotificationAlreadyRead", "This notification was already read",
		map[string]any{"notificationId": notificationID})
}

func ChannelAlreadyTried(notificationID string, channel Channel) *domain.Exception {
	return exception("ChannelAlreadyTried", "This channel was already tried for this notification",
		map[string]any{"notificationId": notificationID, "channel": string(channel)})
}
