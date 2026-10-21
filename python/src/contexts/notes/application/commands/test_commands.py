"""The handlers of one aggregate share one test module, and its fixtures: the in-memory
repository is the double, and a recording bus says what was published. A rule written as
``require_signed_in()`` inside ``execute()`` is tested through ``execute()``."""

from typing import Any

import pytest

from architecture.application.execution_context import Auth, ExecutionContext
from architecture.application.operation import Operation
from architecture.domain.event import Event
from architecture.domain.result import Failure, Success
from architecture.infrastructure.data_sources import InMemoryDataSource
from contexts.notes.application.commands.archive_note import ArchiveNoteCommandEvent, ArchiveNoteCommandHandler
from contexts.notes.application.commands.create_note import CreateNoteCommandEvent, CreateNoteCommandHandler
from contexts.notes.application.commands.edit_note import EditNoteCommandEvent, EditNoteCommandHandler
from contexts.notes.application.commands.restore_note import RestoreNoteCommandEvent, RestoreNoteCommandHandler
from contexts.notes.application.commands.share_note import ShareNoteCommandEvent, ShareNoteCommandHandler
from contexts.notes.domain.note.dtos import NoteSnapshot
from contexts.notes.domain.note.events import NoteArchivedEvent, NoteCreatedEvent, NoteSharedEvent
from contexts.notes.domain.note.note_sharing import NoteSharing
from contexts.notes.domain.note.note_status import NoteStatus
from contexts.notes.infrastructure.repositories import InMemoryNoteRepository
from shared_kernel.domain.role import Role


class RecordingBus:
    """What the handlers published, in order; nothing is dispatched."""

    def __init__(self) -> None:
        self.published: list[Event] = []

    async def connect(self) -> None: ...

    def publish[E: Event](self, event: E, context: ExecutionContext) -> Operation[E]:
        self.published.append(event)
        return Operation(event, context)

    async def dispatch(self, operation: Operation[Any]) -> Operation[Any]:
        return operation

    async def subscribe(self, channel: str, handler: object) -> None: ...


class Directory:
    """Every account the tests talk about exists; the directory itself is covered by test_note_sharing."""

    async def exists(self, account_id: str) -> bool:
        return account_id in ("alice", "bob", "carol")


class Fixture:
    def __init__(self) -> None:
        self.store: InMemoryDataSource[NoteSnapshot] = InMemoryDataSource()
        self.repository = InMemoryNoteRepository(self.store)
        self.bus = RecordingBus()
        self.sharing = NoteSharing(Directory())

    def context_for(self, subject_id: str | None, role: Role = Role.USER) -> ExecutionContext:
        return ExecutionContext(trace_id="trace", event_bus=self.bus, auth=Auth(subject_id=subject_id, role=role))

    async def a_note_owned_by(self, owner_id: str) -> str:
        created = await CreateNoteCommandHandler(self.repository).execute(
            CreateNoteCommandEvent(title="Groceries", content="Milk"), self.context_for(owner_id)
        )
        assert isinstance(created, Success)
        self.bus.published.clear()
        return created.data

    def stored(self, note_id: str) -> NoteSnapshot:
        return self.store.collection[note_id]


@pytest.fixture
def notes() -> Fixture:
    return Fixture()


class TestCreateNote:
    async def test_saves_a_new_active_note_owned_by_the_caller_and_publishes_note_created(self, notes: Fixture) -> None:
        result = await CreateNoteCommandHandler(notes.repository).execute(
            CreateNoteCommandEvent(title="Groceries", content="Milk"), notes.context_for("alice")
        )

        assert isinstance(result, Success)
        note_id = result.data
        assert notes.stored(note_id) == NoteSnapshot(
            id=note_id,
            owner_id="alice",
            title="Groceries",
            content="Milk",
            status=NoteStatus.ACTIVE,
            shared_with=[],
            version=1,
        )
        assert notes.bus.published == [NoteCreatedEvent(note_id=note_id, owner_id="alice", title="Groceries")]

    async def test_refuses_a_blank_title_and_saves_nothing(self, notes: Fixture) -> None:
        result = await CreateNoteCommandHandler(notes.repository).execute(
            CreateNoteCommandEvent(title="   ", content="Milk"), notes.context_for("alice")
        )

        assert isinstance(result, Failure) and result.error.type == "BlankNoteTitle"
        assert notes.store.collection == {}
        assert notes.bus.published == []

    async def test_refuses_an_anonymous_caller(self, notes: Fixture) -> None:
        result = await CreateNoteCommandHandler(notes.repository).execute(
            CreateNoteCommandEvent(title="Groceries", content="Milk"), notes.context_for(None, Role.GUEST)
        )

        assert isinstance(result, Failure) and result.error.type == "NotAllowed"
        assert notes.store.collection == {}


class TestShareNote:
    async def test_lets_the_owner_share_a_note_and_publishes_note_shared(self, notes: Fixture) -> None:
        note_id = await notes.a_note_owned_by("alice")

        result = await ShareNoteCommandHandler(notes.repository, notes.sharing).execute(
            ShareNoteCommandEvent(note_id=note_id, recipient_id="bob"), notes.context_for("alice")
        )

        assert isinstance(result, Success)
        assert notes.stored(note_id).shared_with == ["bob"]
        assert notes.bus.published == [
            NoteSharedEvent(note_id=note_id, title="Groceries", owner_id="alice", recipient_id="bob")
        ]

    async def test_refuses_a_caller_who_does_not_own_the_note(self, notes: Fixture) -> None:
        note_id = await notes.a_note_owned_by("alice")

        result = await ShareNoteCommandHandler(notes.repository, notes.sharing).execute(
            ShareNoteCommandEvent(note_id=note_id, recipient_id="carol"), notes.context_for("bob")
        )

        assert isinstance(result, Failure) and result.error.type == "NotNoteOwner"
        assert notes.stored(note_id).shared_with == []
        assert notes.bus.published == []

    async def test_fails_on_an_unknown_note(self, notes: Fixture) -> None:
        result = await ShareNoteCommandHandler(notes.repository, notes.sharing).execute(
            ShareNoteCommandEvent(note_id="nope", recipient_id="bob"), notes.context_for("alice")
        )

        assert isinstance(result, Failure) and result.error.type == "NoteNotFound"


class TestArchiveNote:
    async def test_archives_the_note_and_publishes_note_archived_with_who_it_was_shared_with(
        self, notes: Fixture
    ) -> None:
        note_id = await notes.a_note_owned_by("alice")
        await ShareNoteCommandHandler(notes.repository, notes.sharing).execute(
            ShareNoteCommandEvent(note_id=note_id, recipient_id="bob"), notes.context_for("alice")
        )
        notes.bus.published.clear()

        result = await ArchiveNoteCommandHandler(notes.repository).execute(
            ArchiveNoteCommandEvent(note_id=note_id), notes.context_for("alice")
        )

        assert isinstance(result, Success)
        assert notes.stored(note_id).status is NoteStatus.ARCHIVED
        assert notes.bus.published == [
            NoteArchivedEvent(note_id=note_id, title="Groceries", owner_id="alice", shared_with=["bob"])
        ]

    async def test_refuses_a_caller_who_does_not_own_the_note(self, notes: Fixture) -> None:
        note_id = await notes.a_note_owned_by("alice")

        result = await ArchiveNoteCommandHandler(notes.repository).execute(
            ArchiveNoteCommandEvent(note_id=note_id), notes.context_for("bob")
        )

        assert isinstance(result, Failure) and result.error.type == "NotNoteOwner"
        assert notes.stored(note_id).status is NoteStatus.ACTIVE


class TestEditNote:
    async def test_lets_the_owner_change_title_and_content(self, notes: Fixture) -> None:
        note_id = await notes.a_note_owned_by("alice")

        result = await EditNoteCommandHandler(notes.repository).execute(
            EditNoteCommandEvent(note_id=note_id, title="Errands", content="Milk, bread"), notes.context_for("alice")
        )

        assert isinstance(result, Success)
        assert (notes.stored(note_id).title, notes.stored(note_id).content) == ("Errands", "Milk, bread")

    async def test_refuses_to_edit_an_archived_note(self, notes: Fixture) -> None:
        note_id = await notes.a_note_owned_by("alice")
        await ArchiveNoteCommandHandler(notes.repository).execute(
            ArchiveNoteCommandEvent(note_id=note_id), notes.context_for("alice")
        )

        result = await EditNoteCommandHandler(notes.repository).execute(
            EditNoteCommandEvent(note_id=note_id, title="Errands", content="Milk"), notes.context_for("alice")
        )

        assert isinstance(result, Failure) and result.error.type == "NoteArchived"
        assert notes.stored(note_id).title == "Groceries"


class TestRestoreNote:
    async def test_restores_an_archived_note(self, notes: Fixture) -> None:
        note_id = await notes.a_note_owned_by("alice")
        await ArchiveNoteCommandHandler(notes.repository).execute(
            ArchiveNoteCommandEvent(note_id=note_id), notes.context_for("alice")
        )

        result = await RestoreNoteCommandHandler(notes.repository).execute(
            RestoreNoteCommandEvent(note_id=note_id), notes.context_for("alice")
        )

        assert isinstance(result, Success)
        assert notes.stored(note_id).status is NoteStatus.ACTIVE

    async def test_refuses_to_restore_a_note_that_is_not_archived(self, notes: Fixture) -> None:
        note_id = await notes.a_note_owned_by("alice")

        result = await RestoreNoteCommandHandler(notes.repository).execute(
            RestoreNoteCommandEvent(note_id=note_id), notes.context_for("alice")
        )

        assert isinstance(result, Failure) and result.error.type == "NoteNotArchived"
