"""Facts raised by the Notification aggregate. They stay inside the context: a notification is
the end of a chain, and announcing it would notify about the notification, and so on."""

from dataclasses import dataclass

from architecture.domain.event import DomainEvent
from contexts.notifications.domain.notification.channel import Channel


@dataclass(frozen=True)
class NotificationSentEvent(DomainEvent):
    notification_id: str
    recipient_id: str
    via: Channel


@dataclass(frozen=True)
class NotificationFailedEvent(DomainEvent):
    notification_id: str
    recipient_id: str


@dataclass(frozen=True)
class NotificationReadEvent(DomainEvent):
    notification_id: str
    recipient_id: str
