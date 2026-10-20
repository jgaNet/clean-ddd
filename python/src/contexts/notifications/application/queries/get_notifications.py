"""An account reads its own inbox; an administrator may read anyone's."""

import asyncio
from dataclasses import dataclass, field
from typing import Any

from architecture.application.execution_context import ExecutionContext
from architecture.application.query_handler import OK, QueryHandler
from architecture.domain.common_exceptions import NotAllowedException
from architecture.domain.result import Failure, Result, Success
from contexts.notifications.domain.notification.notification_exceptions import SERVICE
from contexts.notifications.domain.notification.ports.notification_queries import (
    InboxFilters,
    NotificationListItem,
    NotificationQueries,
)
from shared_kernel.application.guards import require_signed_in
from shared_kernel.domain.role import Role


@dataclass(frozen=True)
class InboxQuery:
    recipient_id: str
    filters: InboxFilters = field(default_factory=InboxFilters)


@dataclass(frozen=True)
class Inbox:
    notifications: list[NotificationListItem]
    total: int
    unread: int


class GetNotificationsQueryHandler(QueryHandler[NotificationQueries, InboxQuery, Inbox]):
    async def guard(self, query: InboxQuery, context: ExecutionContext) -> Result[Any]:
        reader = require_signed_in(context, SERVICE)
        if isinstance(reader, Failure):
            return reader
        if Role.parse(context.auth.role) is not Role.ADMIN and reader.data.value != query.recipient_id:
            return Failure(NotAllowedException(SERVICE, "Only the recipient or an administrator can read an inbox"))
        return OK

    async def execute(self, query: InboxQuery, context: ExecutionContext) -> Result[Inbox]:
        notifications, total, unread = await asyncio.gather(
            self.queries.find_by_recipient(query.recipient_id, query.filters),
            self.queries.count_by_recipient(query.recipient_id),
            self.queries.count_by_recipient(query.recipient_id, only_unread=True),
        )
        return Success(Inbox(notifications=notifications, total=total, unread=unread))
