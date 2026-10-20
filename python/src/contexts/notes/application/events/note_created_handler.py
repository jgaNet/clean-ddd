from architecture.application.event_handler import EventHandler
from architecture.application.execution_context import ExecutionContext
from architecture.domain.result import Result, Success
from contexts.notes.domain.note.events import NoteCreatedEvent


class NoteCreatedHandler(EventHandler[NoteCreatedEvent]):
    async def execute(self, event: NoteCreatedEvent, context: ExecutionContext) -> Result[None]:
        if context.logger:
            context.logger.debug(f"Note {event.note_id} created by {event.owner_id}", {"traceId": context.trace_id})
        return Success(None)
