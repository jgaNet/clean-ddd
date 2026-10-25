"""Notification is the aggregate root of the Notifications context: something to tell one
account, and the story of how it was delivered.

- it always has a title, a content and a non-empty delivery strategy
- each channel is tried at most once; the attempts are child entities (DeliveryAttempt)
- the first channel that accepts it makes it SENT; when none is left it is FAILED
- only its recipient can mark it read, and only once it was delivered

Talking to a channel is not the aggregate's job (see the NotificationChannel port and the
NotificationDelivery application service); recording what happened is.
"""

from datetime import UTC, datetime
from typing import Any

from architecture.domain.aggregate_root import AggregateRoot
from architecture.domain.id import Id
from architecture.domain.result import Failure, Result, Success
from contexts.notifications.domain.notification.channel import Channel
from contexts.notifications.domain.notification.delivery_attempt import DeliveryAttempt
from contexts.notifications.domain.notification.delivery_strategy import DeliveryStrategy
from contexts.notifications.domain.notification.dtos import NewNotification, NotificationSnapshot
from contexts.notifications.domain.notification.events import (
    NotificationFailedEvent,
    NotificationReadEvent,
    NotificationSentEvent,
)
from contexts.notifications.domain.notification.notification_exceptions import (
    BlankNotificationContentException,
    BlankNotificationTitleException,
    ChannelAlreadyTriedException,
    NotificationAlreadyReadException,
    NotificationNotDeliveredException,
    NotNotificationRecipientException,
)
from contexts.notifications.domain.notification.notification_status import NotificationStatus

OK: Result[None] = Success(None)


class Notification(AggregateRoot):
    __slots__ = (
        "_attempts",
        "_content",
        "_created_at",
        "_delivered_via",
        "_metadata",
        "_read_at",
        "_recipient_id",
        "_sent_at",
        "_status",
        "_strategy",
        "_title",
    )

    def __init__(
        self,
        id: Id,
        recipient_id: Id,
        title: str,
        content: str,
        strategy: DeliveryStrategy,
        status: NotificationStatus,
        created_at: datetime,
        metadata: dict[str, Any],
        attempts: list[DeliveryAttempt],
        sent_at: datetime | None = None,
        read_at: datetime | None = None,
        delivered_via: Channel | None = None,
        version: int = 0,
    ) -> None:
        """Private: the only ways in are ``create()`` and ``from_snapshot()``."""
        super().__init__(id, version)
        self._recipient_id = recipient_id
        self._title = title
        self._content = content
        self._strategy = strategy
        self._status = status
        self._created_at = created_at
        self._metadata = dict(metadata)
        self._attempts = list(attempts)
        self._sent_at = sent_at
        self._read_at = read_at
        self._delivered_via = delivered_via

    @staticmethod
    def create(props: NewNotification, now: datetime | None = None) -> Result["Notification"]:
        title = props.title.strip()
        if not title:
            return Failure(BlankNotificationTitleException())
        content = props.content.strip()
        if not content:
            return Failure(BlankNotificationContentException())
        strategy = DeliveryStrategy.create(props.channels)
        if isinstance(strategy, Failure):
            return strategy
        return Success(
            Notification(
                Id.generate(),
                Id(props.recipient_id),
                title,
                content,
                strategy.data,
                NotificationStatus.PENDING,
                now or datetime.now(UTC),
                props.metadata,
                [],
            )
        )

    @staticmethod
    def from_snapshot(snapshot: NotificationSnapshot) -> "Notification":
        strategy = DeliveryStrategy.create(snapshot.channels)
        if isinstance(strategy, Failure) or not snapshot.title.strip() or not snapshot.content.strip():
            raise ValueError(f"Corrupted notification {snapshot.id}")
        return Notification(
            Id(snapshot.id),
            Id(snapshot.recipient_id),
            snapshot.title,
            snapshot.content,
            strategy.data,
            snapshot.status,
            snapshot.created_at,
            snapshot.metadata,
            [DeliveryAttempt.from_snapshot(attempt) for attempt in snapshot.attempts],
            snapshot.sent_at,
            snapshot.read_at,
            snapshot.delivered_via,
            snapshot.version,
        )

    def channels_to_try(self) -> list[Channel]:
        """The channels of the strategy not tried yet, in order. Empty once delivered or exhausted."""
        if self._status is not NotificationStatus.PENDING:
            return []
        tried = {attempt.channel for attempt in self._attempts}
        return [channel for channel in self._strategy.channels if channel not in tried]

    def record_attempt(self, channel: Channel, succeeded: bool, at: datetime | None = None) -> Result[None]:
        """Records what a channel answered. A success delivers the notification; the last failure fails it."""
        if any(attempt.channel is channel for attempt in self._attempts):
            return Failure(ChannelAlreadyTriedException(self.id.value, channel.value))
        when = at or datetime.now(UTC)
        self._attempts.append(DeliveryAttempt.create(channel, succeeded, when))

        if succeeded:
            self._status = NotificationStatus.SENT
            self._sent_at = when
            self._delivered_via = channel
            self._record(
                NotificationSentEvent(notification_id=self.id.value, recipient_id=self._recipient_id.value, via=channel)
            )
        elif not self.channels_to_try():
            self._status = NotificationStatus.FAILED
            self._record(NotificationFailedEvent(notification_id=self.id.value, recipient_id=self._recipient_id.value))
        return OK

    def mark_read(self, actor_id: Id, at: datetime | None = None) -> Result[None]:
        if self._recipient_id != actor_id:
            return Failure(NotNotificationRecipientException(self.id.value, actor_id.value))
        if self._status is NotificationStatus.READ:
            return Failure(NotificationAlreadyReadException(self.id.value))
        if self._status is not NotificationStatus.SENT:
            return Failure(NotificationNotDeliveredException(self.id.value))

        self._status = NotificationStatus.READ
        self._read_at = at or datetime.now(UTC)
        self._record(NotificationReadEvent(notification_id=self.id.value, recipient_id=self._recipient_id.value))
        return OK

    def to_snapshot(self) -> NotificationSnapshot:
        return NotificationSnapshot(
            id=self.id.value,
            recipient_id=self._recipient_id.value,
            title=self._title,
            content=self._content,
            channels=self._strategy.channels,
            status=self._status,
            created_at=self._created_at,
            metadata=dict(self._metadata),
            attempts=[attempt.to_snapshot() for attempt in self._attempts],
            sent_at=self._sent_at,
            read_at=self._read_at,
            delivered_via=self._delivered_via,
            version=self.version,
        )

    @property
    def recipient_id(self) -> Id:
        return self._recipient_id

    @property
    def title(self) -> str:
        return self._title

    @property
    def content(self) -> str:
        return self._content

    @property
    def status(self) -> NotificationStatus:
        return self._status

    @property
    def delivered_via(self) -> Channel | None:
        return self._delivered_via

    @property
    def metadata(self) -> dict[str, Any]:
        return dict(self._metadata)

    @property
    def attempts(self) -> list[DeliveryAttempt]:
        return list(self._attempts)
