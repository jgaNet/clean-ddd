"""Where a domain event leaves its context. The handler owns the translation from the Notes
vocabulary (NoteSharedEvent, internal) to the published one (NoteSharedIntegrationEvent, shared
kernel). Nothing else about Notes crosses the border."""

from architecture.application.event_handler import EventHandler
from architecture.application.execution_context import ExecutionContext
from architecture.domain.result import Result, Success
from contexts.notes.domain.note.events import NoteSharedEvent
from shared_kernel.application.integration_events.note_integration_events import NoteSharedIntegrationEvent


class NoteSharedHandler(EventHandler[NoteSharedEvent]):
    async def execute(self, event: NoteSharedEvent, context: ExecutionContext) -> Result[None]:
        if context.logger:
            context.logger.debug(
                f"Note {event.note_id} shared with {event.recipient_id}", {"traceId": context.trace_id}
            )

        context.event_bus.publish(
            NoteSharedIntegrationEvent(
                note_id=event.note_id,
                title=event.title,
                owner_id=event.owner_id,
                recipient_id=event.recipient_id,
            ),
            context,
        )
        return Success(None)
