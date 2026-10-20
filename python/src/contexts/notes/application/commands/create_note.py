from dataclasses import dataclass

from architecture.application.command_handler import CommandHandler
from architecture.application.execution_context import ExecutionContext
from architecture.domain.event import CommandEvent
from architecture.domain.result import Failure, Result, Success
from contexts.notes.domain.note.dtos import NewNote
from contexts.notes.domain.note.note import Note
from contexts.notes.domain.note.note_exceptions import SERVICE
from contexts.notes.domain.note.ports.note_repository import NoteRepository
from shared_kernel.application.guards import require_signed_in


@dataclass(frozen=True)
class CreateNoteCommandEvent(CommandEvent):
    title: str
    content: str


class CreateNoteCommandHandler(CommandHandler[CreateNoteCommandEvent]):
    def __init__(self, notes: NoteRepository) -> None:
        self._notes = notes

    async def execute(self, command: CreateNoteCommandEvent, context: ExecutionContext) -> Result[str]:
        owner = require_signed_in(context, SERVICE)
        if isinstance(owner, Failure):
            return owner

        note = Note.create(NewNote(owner_id=owner.data.value, title=command.title, content=command.content))
        if isinstance(note, Failure):
            return note

        saved = await self._notes.save(note.data)
        if isinstance(saved, Failure):
            return saved
        self.publish_domain_events(note.data, context)

        return Success(note.data.id.value)
