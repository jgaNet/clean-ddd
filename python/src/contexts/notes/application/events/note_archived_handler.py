"""Where the archiving of a note leaves its context: the Notes fact (NoteArchivedEvent, internal)
becomes the published one (NoteArchivedIntegrationEvent, shared kernel), in Notes' public words.
It is published whenever a note is archived, shared with anyone or not; who is told, and how, is
the consumer's business."""

from architecture.application.event_handler import EventHandler
from architecture.application.execution_context import ExecutionContext
from architecture.domain.result import Result, Success
from contexts.notes.domain.note.events import NoteArchivedEvent
from shared_kernel.application.integration_events.note_integration_events import NoteArchivedIntegrationEvent


class NoteArchivedHandler(EventHandler[NoteArchivedEvent]):
    async def execute(self, event: NoteArchivedEvent, context: ExecutionContext) -> Result[None]:
        if context.logger:
            context.logger.debug(
                f"Note {event.note_id} archived, shared with {len(event.shared_with)} account(s)",
                {"traceId": context.trace_id},
            )

        context.event_bus.publish(
            NoteArchivedIntegrationEvent(
                note_id=event.note_id,
                title=event.title,
                owner_id=event.owner_id,
                recipient_ids=list(event.shared_with),
            ),
            context,
        )
        return Success(None)
