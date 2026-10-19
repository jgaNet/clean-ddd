"""Anti-corruption layer towards Tracker: the caller of an asynchronous command learns how it
went, live, over the websocket. Only the outcomes are worth a notification."""

from typing import Any

from architecture.application.event_handler import EventHandler
from architecture.application.execution_context import ExecutionContext
from architecture.application.operation import OperationStatus
from architecture.domain.result import Result, Success
from contexts.notifications.application.delivery import NotificationDelivery
from contexts.notifications.domain.notification.channel import Channel
from contexts.notifications.domain.notification.dtos import NewNotification
from shared_kernel.application.integration_events.tracker_integration_events import (
    OperationCompleteIntegrationEvent,
)


class OperationCompleteIntegrationEventHandler(EventHandler[OperationCompleteIntegrationEvent]):
    def __init__(self, delivery: NotificationDelivery) -> None:
        self._delivery = delivery

    async def execute(self, event: OperationCompleteIntegrationEvent, context: ExecutionContext) -> Result[Any]:
        if event.status == OperationStatus.SUCCESS:
            title, content = f"Operation complete: {event.type}", f"Your operation {event.operation_id} succeeded."
        elif event.status == OperationStatus.ERROR:
            title = f"Operation failed: {event.type}"
            content = f"Your operation {event.operation_id} failed: {event.error or 'unknown error'}"
        else:
            return Success(None)  # not an outcome (PENDING, SENT): nothing to tell the user yet

        metadata: dict[str, Any] = {"operationId": event.operation_id, "type": event.type, "status": event.status}
        if event.result is not None:
            metadata["result"] = event.result
        if event.error:
            metadata["error"] = event.error
        return await self._delivery.deliver(
            NewNotification(
                recipient_id=event.user_id,
                title=title,
                content=content,
                channels=[Channel.WEBSOCKET],
                metadata=metadata,
            ),
            context,
        )
