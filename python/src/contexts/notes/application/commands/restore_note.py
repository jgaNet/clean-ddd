from dataclasses import dataclass

from architecture.application.command_handler import OK, CommandHandler
from architecture.application.execution_context import ExecutionContext
from architecture.domain.event import CommandEvent
from architecture.domain.result import Failure, Result
from contexts.notes.domain.note.note_exceptions import SERVICE, NoteNotFoundException
from contexts.notes.domain.note.ports.note_repository import NoteRepository
from shared_kernel.application.guards import require_signed_in


@dataclass(frozen=True)
class RestoreNoteCommandEvent(CommandEvent):
    note_id: str


class RestoreNoteCommandHandler(CommandHandler[RestoreNoteCommandEvent]):
    def __init__(self, notes: NoteRepository) -> None:
        self._notes = notes

    async def execute(self, command: RestoreNoteCommandEvent, context: ExecutionContext) -> Result[None]:
        actor = require_signed_in(context, SERVICE)
        if isinstance(actor, Failure):
            return actor

        note = await self._notes.find_by_id(command.note_id)
        if note is None:
            return Failure(NoteNotFoundException(command.note_id))

        restored = note.restore(actor.data)
        if isinstance(restored, Failure):
            return restored

        saved = await self._notes.save(note)
        if isinstance(saved, Failure):
            return saved
        self.publish_domain_events(note, context)

        return OK
