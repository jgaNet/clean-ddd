from architecture.infrastructure.data_sources import InMemoryDataSource
from contexts.notifications.domain.notification.dtos import NotificationSnapshot
from contexts.notifications.domain.notification.notification import Notification


class InMemoryNotificationRepository:
    def __init__(self, data_source: InMemoryDataSource[NotificationSnapshot]) -> None:
        self._data_source = data_source

    async def find_by_id(self, id: str) -> Notification | None:
        snapshot = self._data_source.collection.get(id)
        return Notification.from_snapshot(snapshot) if snapshot else None

    async def save(self, notification: Notification) -> None:
        self._data_source.collection[notification.id.value] = notification.to_snapshot()
