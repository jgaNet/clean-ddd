"""Domain exceptions of the Notification aggregate: a broken business rule, in business words."""

from typing import Any

from architecture.domain.exception import DomainException

SERVICE = "Notifications"


class NotificationDomainException(DomainException):
    def __init__(self, type: str, message: str, context: dict[str, Any] | None = None) -> None:
        super().__init__(service=SERVICE, type=type, message=message, context=context or {})


class BlankNotificationTitleException(NotificationDomainException):
    def __init__(self) -> None:
        super().__init__("BlankNotificationTitle", "A notification needs a title")


class BlankNotificationContentException(NotificationDomainException):
    def __init__(self) -> None:
        super().__init__("BlankNotificationContent", "A notification needs a content")


class EmptyDeliveryStrategyException(NotificationDomainException):
    def __init__(self) -> None:
        super().__init__("EmptyDeliveryStrategy", "A notification needs at least one channel")


class NotificationNotFoundException(NotificationDomainException):
    def __init__(self, notification_id: str) -> None:
        super().__init__("NotificationNotFound", "Notification not found", {"notificationId": notification_id})


class NotNotificationRecipientException(NotificationDomainException):
    def __init__(self, notification_id: str, actor_id: str) -> None:
        super().__init__(
            "NotNotificationRecipient",
            "Only the recipient of a notification can read it",
            {"notificationId": notification_id, "actorId": actor_id},
        )


class NotificationNotDeliveredException(NotificationDomainException):
    def __init__(self, notification_id: str) -> None:
        super().__init__(
            "NotificationNotDelivered",
            "A notification can only be read once it was delivered",
            {"notificationId": notification_id},
        )


class NotificationAlreadyReadException(NotificationDomainException):
    def __init__(self, notification_id: str) -> None:
        super().__init__(
            "NotificationAlreadyRead", "This notification was already read", {"notificationId": notification_id}
        )


class ChannelAlreadyTriedException(NotificationDomainException):
    def __init__(self, notification_id: str, channel: str) -> None:
        super().__init__(
            "ChannelAlreadyTried",
            "This channel was already tried for this notification",
            {"notificationId": notification_id, "channel": channel},
        )
