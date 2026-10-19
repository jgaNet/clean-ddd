"""Snapshot of a Notification, attempts included: the aggregate is persisted as a whole."""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from contexts.notifications.domain.notification.channel import Channel
from contexts.notifications.domain.notification.notification_status import NotificationStatus


@dataclass(frozen=True)
class DeliveryAttemptSnapshot:
    id: str
    channel: Channel
    at: datetime
    succeeded: bool


@dataclass(frozen=True)
class NotificationSnapshot:
    id: str
    recipient_id: str
    title: str
    content: str
    channels: list[Channel]
    status: NotificationStatus
    created_at: datetime
    metadata: dict[str, Any] = field(default_factory=dict)
    attempts: list[DeliveryAttemptSnapshot] = field(default_factory=list)
    sent_at: datetime | None = None
    read_at: datetime | None = None
    delivered_via: Channel | None = None
    version: int = 0


@dataclass(frozen=True)
class NewNotification:
    """What is needed to send a new notification."""

    recipient_id: str
    title: str
    content: str
    channels: list[Channel]
    #: Whatever a channel may need that is not the notification itself (an email address, a source).
    metadata: dict[str, Any] = field(default_factory=dict)
