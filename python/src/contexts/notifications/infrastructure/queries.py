from architecture.infrastructure.data_sources import InMemoryDataSource
from contexts.notifications.domain.notification.dtos import NotificationSnapshot
from contexts.notifications.domain.notification.notification_status import NotificationStatus
from contexts.notifications.domain.notification.ports.notification_queries import InboxFilters, NotificationListItem


def to_list_item(n: NotificationSnapshot) -> NotificationListItem:
    return NotificationListItem(
        id=n.id,
        recipient_id=n.recipient_id,
        title=n.title,
        content=n.content,
        status=n.status,
        channels=list(n.channels),
        created_at=n.created_at,
        delivered_via=n.delivered_via,
        sent_at=n.sent_at,
        read_at=n.read_at,
        metadata=dict(n.metadata),
    )


class InMemoryNotificationQueries:
    def __init__(self, data_source: InMemoryDataSource[NotificationSnapshot]) -> None:
        self._data_source = data_source

    async def find_by_recipient(
        self, recipient_id: str, filters: InboxFilters | None = None
    ) -> list[NotificationListItem]:
        filters = filters or InboxFilters()
        inbox = sorted(self._inbox(recipient_id, filters.only_unread), key=lambda n: n.created_at, reverse=True)
        return [to_list_item(n) for n in inbox[filters.offset : filters.offset + filters.limit]]

    async def count_by_recipient(self, recipient_id: str, only_unread: bool = False) -> int:
        return len(self._inbox(recipient_id, only_unread))

    def _inbox(self, recipient_id: str, only_unread: bool) -> list[NotificationSnapshot]:
        return [
            n
            for n in self._data_source.collection.values()
            if n.recipient_id == recipient_id and (not only_unread or n.status is NotificationStatus.SENT)
        ]
