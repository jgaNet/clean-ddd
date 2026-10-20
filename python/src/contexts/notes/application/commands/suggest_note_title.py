"""The canonical example of ADR 7: a decision the domain cannot make from its own state enters
it as a value. The handler asks the port (the only non-deterministic step), then hands the
suggestion to the aggregate exactly as it would hand it a title typed by the owner: ``edit()``
applies NoteTitle's rules and the owner-and-active rules, and refuses a blank or too long
suggestion like any other. The source proposes; the domain disposes.

The suggestion, with its provenance, is the operation's result: the Tracker keeps it, so an
accepted title can be traced to the source and the version that proposed it.
"""

from dataclasses import dataclass

from architecture.application.command_handler import CommandHandler
from architecture.application.execution_context import ExecutionContext
from architecture.domain.event import CommandEvent
from architecture.domain.result import Failure, Result, Success
from contexts.notes.application.suggestions import NoteTitleSuggestions, TitleSuggestion
from contexts.notes.domain.note.note_exceptions import SERVICE, NoteNotFoundException
from contexts.notes.domain.note.ports.note_repository import NoteRepository
from shared_kernel.application.guards import require_signed_in


@dataclass(frozen=True)
class SuggestNoteTitleCommandEvent(CommandEvent):
    """Asks for a title for the note, from its content, and applies it if the note accepts it."""

    note_id: str


class SuggestNoteTitleCommandHandler(CommandHandler[SuggestNoteTitleCommandEvent]):
    def __init__(self, notes: NoteRepository, suggestions: NoteTitleSuggestions) -> None:
        self._notes = notes
        self._suggestions = suggestions

    async def execute(
        self, command: SuggestNoteTitleCommandEvent, context: ExecutionContext
    ) -> Result[TitleSuggestion]:
        actor = require_signed_in(context, SERVICE)
        if isinstance(actor, Failure):
            return actor

        note = await self._notes.find_by_id(command.note_id)
        if note is None:
            return Failure(NoteNotFoundException(command.note_id))

        suggestion = await self._suggestions.suggest(note.content)

        applied = note.edit(actor.data, suggestion.title, note.content)
        if isinstance(applied, Failure):
            return applied

        saved = await self._notes.save(note)
        if isinstance(saved, Failure):
            return saved
        self.publish_domain_events(note, context)

        return Success(suggestion)
