"""Anti-corruption layer of the Notifications context towards Notes.

It knows the published contract (NoteSharedIntegrationEvent) and nothing else about Notes: no
Note aggregate, no Notes exception, no Notes port. It restates the fact in the Notifications
vocabulary (a recipient, a title, channels) and hands it to the local use case. If the Notes
contract changes, this file is the only one to touch here.
"""

from architecture.application.event_handler import EventHandler
from architecture.application.execution_context import ExecutionContext
from architecture.domain.result import Result
from contexts.notifications.application.delivery import NotificationDelivery
from contexts.notifications.domain.notification.channel import Channel
from contexts.notifications.domain.notification.dtos import NewNotification
from shared_kernel.application.integration_events.note_integration_events import NoteSharedIntegrationEvent


class NoteSharedIntegrationEventHandler(EventHandler[NoteSharedIntegrationEvent]):
    def __init__(self, delivery: NotificationDelivery) -> None:
        self._delivery = delivery

    async def execute(self, event: NoteSharedIntegrationEvent, context: ExecutionContext) -> Result[str]:
        return await self._delivery.deliver(
            NewNotification(
                recipient_id=event.recipient_id,
                title=f"A note was shared with you: {event.title}",
                content=f'You now have access to the note "{event.title}".',
                channels=[Channel.WEBSOCKET],
                metadata={"noteId": event.note_id, "sharedBy": event.owner_id, "source": "Notes.NoteShared"},
            ),
            context,
        )
