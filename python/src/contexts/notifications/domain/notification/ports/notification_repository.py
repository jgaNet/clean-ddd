from typing import Protocol

from contexts.notifications.domain.notification.notification import Notification


class NotificationRepository(Protocol):
    async def find_by_id(self, id: str) -> Notification | None: ...  # noqa: A002

    async def save(self, notification: Notification) -> None: ...
