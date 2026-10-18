"""The shape every "change an existing note" use case follows:
who is calling -> load the aggregate -> ask it to change -> save -> publish what it recorded.
No rule of its own: everything that can be refused is refused by Note, and comes back as a
``Failure`` the handler returns as is."""

from dataclasses import dataclass

from architecture.application.command_handler import OK, CommandHandler
from architecture.application.execution_context import ExecutionContext
from architecture.domain.event import CommandEvent
from architecture.domain.result import Failure, Result
from contexts.notes.domain.note.note_exceptions import SERVICE, NoteNotFoundException
from contexts.notes.domain.note.ports.note_repository import NoteRepository
from shared_kernel.application.guards import require_signed_in


@dataclass(frozen=True)
class EditNoteCommandEvent(CommandEvent):
    note_id: str
    title: str
    content: str


class EditNoteCommandHandler(CommandHandler[EditNoteCommandEvent]):
    def __init__(self, notes: NoteRepository) -> None:
        self._notes = notes

    async def execute(self, command: EditNoteCommandEvent, context: ExecutionContext) -> Result[None]:
        actor = require_signed_in(context, SERVICE)
        if isinstance(actor, Failure):
            return actor

        note = await self._notes.find_by_id(command.note_id)
        if note is None:
            return Failure(NoteNotFoundException(command.note_id))

        edited = note.edit(actor.data, command.title, command.content)
        if isinstance(edited, Failure):
            return edited

        saved = await self._notes.save(note)
        if isinstance(saved, Failure):
            return saved
        self.publish_domain_events(note, context)

        return OK
