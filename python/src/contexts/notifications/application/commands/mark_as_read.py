from dataclasses import dataclass

from architecture.application.command_handler import OK, CommandHandler
from architecture.application.execution_context import ExecutionContext
from architecture.domain.event import CommandEvent
from architecture.domain.result import Failure, Result
from contexts.notifications.domain.notification.notification_exceptions import SERVICE, NotificationNotFoundException
from contexts.notifications.domain.notification.ports.notification_repository import NotificationRepository
from shared_kernel.application.guards import require_signed_in


@dataclass(frozen=True)
class MarkAsReadNotificationCommandEvent(CommandEvent):
    notification_id: str


class MarkAsReadNotificationCommandHandler(CommandHandler[MarkAsReadNotificationCommandEvent]):
    def __init__(self, notifications: NotificationRepository) -> None:
        self._notifications = notifications

    async def execute(self, command: MarkAsReadNotificationCommandEvent, context: ExecutionContext) -> Result[None]:
        reader = require_signed_in(context, SERVICE)
        if isinstance(reader, Failure):
            return reader

        notification = await self._notifications.find_by_id(command.notification_id)
        if notification is None:
            return Failure(NotificationNotFoundException(command.notification_id))

        read = notification.mark_read(reader.data)
        if isinstance(read, Failure):
            return read

        await self._notifications.save(notification)
        self.publish_domain_events(notification, context)
        return OK
