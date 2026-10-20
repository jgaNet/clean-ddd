"""The wiring of the Notes context: the one place its handlers are bound to its adapters and
listed in a ``Module``. Plain data: construct the handler, pass its ports, list it
(ARCH-MODULES-DATA). Anything else the context exposes is a name of this file.

Sharing needs to know whether an account exists: Notes asks through its own port, which the
composition root answers with an adapter over Security's read model. Notes never imports
Security; the directory comes in as a parameter, which is where the two contexts meet.
"""

from architecture.application.module import Module, Subscription
from architecture.infrastructure.data_sources import InMemoryDataSource
from contexts.notes.application.commands.archive_note import ArchiveNoteCommandEvent, ArchiveNoteCommandHandler
from contexts.notes.application.commands.create_note import CreateNoteCommandEvent, CreateNoteCommandHandler
from contexts.notes.application.commands.edit_note import EditNoteCommandEvent, EditNoteCommandHandler
from contexts.notes.application.commands.pin_note import PinNoteCommandEvent, PinNoteCommandHandler
from contexts.notes.application.commands.restore_note import RestoreNoteCommandEvent, RestoreNoteCommandHandler
from contexts.notes.application.commands.share_note import ShareNoteCommandEvent, ShareNoteCommandHandler
from contexts.notes.application.commands.suggest_note_title import (
    SuggestNoteTitleCommandEvent,
    SuggestNoteTitleCommandHandler,
)
from contexts.notes.application.commands.unpin_note import UnpinNoteCommandEvent, UnpinNoteCommandHandler
from contexts.notes.application.events.note_created_handler import NoteCreatedHandler
from contexts.notes.application.events.note_shared_handler import NoteSharedHandler
from contexts.notes.application.queries.get_my_notes import GetMyNotesQueryHandler
from contexts.notes.application.queries.get_note import GetNoteQueryHandler
from contexts.notes.application.queries.get_notes_shared_with_me import GetNotesSharedWithMeQueryHandler
from contexts.notes.domain.note.dtos import NoteSnapshot
from contexts.notes.domain.note.events import NoteCreatedEvent, NoteSharedEvent
from contexts.notes.domain.note.note_sharing import NoteSharing
from contexts.notes.domain.note.ports.account_directory import AccountDirectory
from contexts.notes.infrastructure.queries import InMemoryNoteQueries
from contexts.notes.infrastructure.repositories import InMemoryNoteRepository
from contexts.notes.infrastructure.suggestions import FirstLineTitleSuggestions

#: The context's store, which the composition root hands to the unit of work.
NoteStore = InMemoryDataSource[NoteSnapshot]


def note_store() -> NoteStore:
    return InMemoryDataSource()


def local_notes_module(store: NoteStore, accounts: AccountDirectory) -> Module:
    """The Notes module for the local environment: write side and read side share the same store
    here; a real deployment may split them."""
    repository = InMemoryNoteRepository(store)
    queries = InMemoryNoteQueries(store)

    return Module(
        name="Notes",
        commands=[
            Subscription(CreateNoteCommandEvent, [CreateNoteCommandHandler(repository)]),
            Subscription(EditNoteCommandEvent, [EditNoteCommandHandler(repository)]),
            Subscription(ArchiveNoteCommandEvent, [ArchiveNoteCommandHandler(repository)]),
            Subscription(RestoreNoteCommandEvent, [RestoreNoteCommandHandler(repository)]),
            Subscription(PinNoteCommandEvent, [PinNoteCommandHandler(repository)]),
            Subscription(UnpinNoteCommandEvent, [UnpinNoteCommandHandler(repository)]),
            Subscription(ShareNoteCommandEvent, [ShareNoteCommandHandler(repository, NoteSharing(accounts))]),
            # The one non-deterministic source of the context, behind a port (ADR 7); a model would go here.
            Subscription(
                SuggestNoteTitleCommandEvent, [SuggestNoteTitleCommandHandler(repository, FirstLineTitleSuggestions())]
            ),
        ],
        queries=[
            GetMyNotesQueryHandler(queries),
            GetNoteQueryHandler(queries),
            GetNotesSharedWithMeQueryHandler(queries),
        ],
        domain_events=[
            Subscription(NoteCreatedEvent, [NoteCreatedHandler()]),
            Subscription(NoteSharedEvent, [NoteSharedHandler()]),
        ],
    )
