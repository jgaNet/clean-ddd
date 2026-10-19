"""One implementation per Channel value, in the infrastructure (websocket, email...). The port
knows nothing about logging or transport: an adapter that needs a logger takes it in its
constructor."""

from dataclasses import dataclass, field
from typing import Any, Protocol

from architecture.domain.result import Result
from contexts.notifications.domain.notification.channel import Channel


@dataclass(frozen=True)
class Delivery:
    """What a channel receives: enough to deliver, nothing about how the aggregate is built."""

    notification_id: str
    recipient_id: str
    title: str
    content: str
    metadata: dict[str, Any] = field(default_factory=dict)


class NotificationChannel(Protocol):
    @property
    def channel(self) -> Channel: ...

    async def is_available_for(self, recipient_id: str) -> bool: ...

    async def deliver(self, delivery: Delivery) -> Result[None]: ...
