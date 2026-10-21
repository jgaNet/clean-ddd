"""Anti-corruption layer of the Notifications context towards Notes, for an archived note.

It knows the published contract (NoteArchivedIntegrationEvent) and nothing else about Notes. The
contract names every account the note was shared with; the fan-out is this side's business: one
notification per recipient, each in the Notifications vocabulary, each through the local use
case. A note shared with nobody is a fact with nobody to tell.
"""

from architecture.application.event_handler import EventHandler
from architecture.application.execution_context import ExecutionContext
from architecture.domain.result import Failure, Result, Success
from contexts.notifications.application.delivery import NotificationDelivery
from contexts.notifications.domain.notification.channel import Channel
from contexts.notifications.domain.notification.dtos import NewNotification
from shared_kernel.application.integration_events.note_integration_events import NoteArchivedIntegrationEvent


class NoteArchivedIntegrationEventHandler(EventHandler[NoteArchivedIntegrationEvent]):
    def __init__(self, delivery: NotificationDelivery) -> None:
        self._delivery = delivery

    async def execute(self, event: NoteArchivedIntegrationEvent, context: ExecutionContext) -> Result[list[str]]:
        """Answers the ids of the notifications it created, one per recipient."""
        notification_ids: list[str] = []
        for recipient_id in event.recipient_ids:
            delivered = await self._delivery.deliver(
                NewNotification(
                    recipient_id=recipient_id,
                    title=f"A note is no longer available: {event.title}",
                    content=f'The note "{event.title}" was archived by its owner and is no longer shared with you.',
                    channels=[Channel.WEBSOCKET],
                    metadata={"noteId": event.note_id, "archivedBy": event.owner_id, "source": "Notes.NoteArchived"},
                ),
                context,
            )
            if isinstance(delivered, Failure):
                return delivered
            notification_ids.append(delivered.data)
        return Success(notification_ids)
