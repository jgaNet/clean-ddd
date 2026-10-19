"""The ordered list of channels to try until one accepts the notification: a value object, so a
strategy is always non-empty and free of duplicates, and two strategies with the same channels
in the same order are the same strategy (the order is the strategy)."""

from collections.abc import Sequence
from dataclasses import dataclass

from architecture.domain.result import Failure, Result, Success
from architecture.domain.value_object import ValueObject
from contexts.notifications.domain.notification.channel import Channel
from contexts.notifications.domain.notification.notification_exceptions import EmptyDeliveryStrategyException


@dataclass(frozen=True, slots=True)
class DeliveryStrategy(ValueObject[tuple[Channel, ...]]):
    @staticmethod
    def create(channels: Sequence[Channel]) -> Result["DeliveryStrategy"]:
        distinct = tuple(dict.fromkeys(channels))
        if not distinct:
            return Failure(EmptyDeliveryStrategyException())
        return Success(DeliveryStrategy(distinct))

    @property
    def channels(self) -> list[Channel]:
        return list(self.value)
