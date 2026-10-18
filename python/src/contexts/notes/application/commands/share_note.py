"""The use case, and nothing but the use case: who is calling, load the aggregate, hand it to
the domain service that holds the one rule the aggregate cannot check alone (the recipient
exists), save, publish what was recorded. No rule of its own: everything that can be refused is
refused by NoteSharing or by Note, and comes back as a ``Failure``."""

from dataclasses import dataclass

from architecture.application.command_handler import OK, CommandHandler
from architecture.application.execution_context import ExecutionContext
from architecture.domain.event import CommandEvent
from architecture.domain.id import Id
from architecture.domain.result import Failure, Result
from contexts.notes.domain.note.note_exceptions import SERVICE, NoteNotFoundException
from contexts.notes.domain.note.note_sharing import NoteSharing
from contexts.notes.domain.note.ports.note_repository import NoteRepository
from shared_kernel.application.guards import require_signed_in


@dataclass(frozen=True)
class ShareNoteCommandEvent(CommandEvent):
    note_id: str
    recipient_id: str


class ShareNoteCommandHandler(CommandHandler[ShareNoteCommandEvent]):
    def __init__(self, notes: NoteRepository, sharing: NoteSharing) -> None:
        self._notes = notes
        self._sharing = sharing

    async def execute(self, command: ShareNoteCommandEvent, context: ExecutionContext) -> Result[None]:
        actor = require_signed_in(context, SERVICE)
        if isinstance(actor, Failure):
            return actor

        note = await self._notes.find_by_id(command.note_id)
        if note is None:
            return Failure(NoteNotFoundException(command.note_id))

        shared = await self._sharing.share(note, actor.data, Id(command.recipient_id))
        if isinstance(shared, Failure):
            return shared

        saved = await self._notes.save(note)
        if isinstance(saved, Failure):
            return saved
        self.publish_domain_events(note, context)

        return OK
