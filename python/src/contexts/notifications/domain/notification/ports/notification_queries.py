"""What an inbox shows. The attempts stay inside the aggregate."""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Protocol

from contexts.notifications.domain.notification.channel import Channel
from contexts.notifications.domain.notification.notification_status import NotificationStatus


@dataclass(frozen=True)
class NotificationListItem:
    id: str
    recipient_id: str
    title: str
    content: str
    status: NotificationStatus
    channels: list[Channel]
    created_at: datetime
    delivered_via: Channel | None = None
    sent_at: datetime | None = None
    read_at: datetime | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class InboxFilters:
    limit: int = 20
    offset: int = 0
    only_unread: bool = False


class NotificationQueries(Protocol):
    async def find_by_recipient(
        self, recipient_id: str, filters: InboxFilters | None = None
    ) -> list[NotificationListItem]:
        """Newest first; ``only_unread`` keeps the delivered ones not read yet. Ordering is part of this contract."""
        ...

    async def count_by_recipient(self, recipient_id: str, only_unread: bool = False) -> int: ...
