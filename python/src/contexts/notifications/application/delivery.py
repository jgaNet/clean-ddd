"""The one use case every entry point of this context ends in: create the notification, try its
channels in order until one accepts it, keep the story. An application service because it
orchestrates ports and publishes events; it holds no rule of its own (the aggregate decides
which channel is next and when it is sent or failed).

Called by the SendNotification command (manual, administrators) and by the anti-corruption
handlers reacting to other contexts.
"""

from collections.abc import Iterable

from architecture.application.domain_events import publish_domain_events
from architecture.application.execution_context import ExecutionContext
from architecture.domain.common_exceptions import UnknownException
from architecture.domain.result import Failure, Result, Success
from contexts.notifications.domain.notification.dtos import NewNotification
from contexts.notifications.domain.notification.notification import Notification
from contexts.notifications.domain.notification.ports.notification_channel import Delivery, NotificationChannel
from contexts.notifications.domain.notification.ports.notification_repository import NotificationRepository


class NotificationDelivery:
    def __init__(self, notifications: NotificationRepository, channels: Iterable[NotificationChannel]) -> None:
        self._notifications = notifications
        self._channels = {adapter.channel: adapter for adapter in channels}

    async def deliver(self, props: NewNotification, context: ExecutionContext) -> Result[str]:
        created = Notification.create(props)
        if isinstance(created, Failure):
            return created
        notification = created.data

        delivery = Delivery(
            notification_id=notification.id.value,
            recipient_id=notification.recipient_id.value,
            title=notification.title,
            content=notification.content,
            metadata=notification.metadata,
        )

        for channel in notification.channels_to_try():
            adapter = self._channels.get(channel)
            available = await adapter.is_available_for(delivery.recipient_id) if adapter else False
            outcome: Result[None] = (
                await adapter.deliver(delivery)
                if adapter and available
                else Failure(UnknownException(f"{channel.value} unavailable"))
            )
            if isinstance(outcome, Failure) and context.logger:
                context.logger.debug(
                    f"Notification {delivery.notification_id}: {channel.value} failed ({outcome.error.message})",
                    {"traceId": context.trace_id},
                )

            notification.record_attempt(channel, isinstance(outcome, Success))
            if isinstance(outcome, Success):
                break

        await self._notifications.save(notification)
        publish_domain_events(notification, context)
        return Success(notification.id.value)
