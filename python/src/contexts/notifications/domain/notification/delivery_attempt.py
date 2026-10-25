"""DeliveryAttempt is an entity that is not an aggregate root: it has its own identity (two
attempts on the same channel are two different attempts), but it only exists inside a
Notification, is created and reached through it, records no events of its own, and is
persisted as part of the Notification's snapshot. Nothing outside the aggregate holds one."""

from datetime import datetime

from architecture.domain.entity import Entity
from architecture.domain.id import Id
from contexts.notifications.domain.notification.channel import Channel
from contexts.notifications.domain.notification.dtos import DeliveryAttemptSnapshot


class DeliveryAttempt(Entity):
    __slots__ = ("_at", "_channel", "_succeeded")

    def __init__(self, id: Id, channel: Channel, at: datetime, succeeded: bool) -> None:
        super().__init__(id)
        self._channel = channel
        self._at = at
        self._succeeded = succeeded

    @staticmethod
    def create(channel: Channel, succeeded: bool, at: datetime) -> "DeliveryAttempt":
        return DeliveryAttempt(Id.generate(), channel, at, succeeded)

    @staticmethod
    def from_snapshot(snapshot: DeliveryAttemptSnapshot) -> "DeliveryAttempt":
        return DeliveryAttempt(Id(snapshot.id), snapshot.channel, snapshot.at, snapshot.succeeded)

    def to_snapshot(self) -> DeliveryAttemptSnapshot:
        return DeliveryAttemptSnapshot(id=self.id.value, channel=self._channel, at=self._at, succeeded=self._succeeded)

    @property
    def channel(self) -> Channel:
        return self._channel

    @property
    def at(self) -> datetime:
        return self._at

    @property
    def succeeded(self) -> bool:
        return self._succeeded
