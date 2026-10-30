"""The ordered list of channels to try until one accepts the notification: a value object, so a
strategy is always non-empty, made of channels the domain knows and free of duplicates, and two
strategies with the same channels in the same order are the same strategy (the order is the
strategy). It takes names as a client sends them: whether a name is a channel is this rule's to
say, not the request model's (API-BODY-SHAPE)."""

from collections.abc import Sequence
from dataclasses import dataclass

from architecture.domain.result import Failure, Result, Success
from architecture.domain.value_object import ValueObject
from contexts.notifications.domain.notification.channel import Channel, is_channel
from contexts.notifications.domain.notification.notification_exceptions import (
    EmptyDeliveryStrategyException,
    UnknownChannelException,
)


@dataclass(frozen=True, slots=True)
class DeliveryStrategy(ValueObject[tuple[Channel, ...]]):
    @staticmethod
    def create(names: Sequence[str]) -> Result["DeliveryStrategy"]:
        unknown = next((name for name in names if not is_channel(name)), None)
        if unknown is not None:
            return Failure(UnknownChannelException(unknown))
        distinct = tuple(dict.fromkeys(Channel(name) for name in names))
        if not distinct:
            return Failure(EmptyDeliveryStrategyException())
        return Success(DeliveryStrategy(distinct))

    @property
    def channels(self) -> list[Channel]:
        return list(self.value)
