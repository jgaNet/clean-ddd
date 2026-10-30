"""A notification sent by hand, by an administrator. Reactions to other contexts do not go through it."""

from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any

from architecture.application.command_handler import OK, CommandHandler
from architecture.application.execution_context import ExecutionContext
from architecture.domain.common_exceptions import NotAllowedException
from architecture.domain.event import CommandEvent
from architecture.domain.result import Failure, Result
from contexts.notifications.application.delivery import NotificationDelivery
from contexts.notifications.domain.notification.dtos import NewNotification
from contexts.notifications.domain.notification.notification_exceptions import SERVICE
from shared_kernel.domain.role import Role


@dataclass(frozen=True)
class SendNotificationCommandEvent(CommandEvent):
    recipient_id: str
    title: str
    content: str
    channels: Sequence[str]
    metadata: dict[str, Any] = field(default_factory=dict)


class SendNotificationCommandHandler(CommandHandler[SendNotificationCommandEvent]):
    def __init__(self, delivery: NotificationDelivery) -> None:
        self._delivery = delivery

    async def guard(self, command: SendNotificationCommandEvent, context: ExecutionContext) -> Result[Any]:
        if Role.parse(context.auth.role) is not Role.ADMIN:
            return Failure(NotAllowedException(SERVICE, "Only administrators can send notifications by hand"))
        return OK

    async def execute(self, command: SendNotificationCommandEvent, context: ExecutionContext) -> Result[str]:
        return await self._delivery.deliver(
            NewNotification(
                recipient_id=command.recipient_id,
                title=command.title,
                content=command.content,
                channels=list(command.channels),
                metadata=dict(command.metadata),
            ),
            context,
        )
