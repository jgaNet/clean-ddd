"""A contract test: the expectations belong to the ports, so every adapter of a port runs the
same ones. Add an adapter (a Postgres one, say) by adding an entry to ``adapters``; if it passes
here, the use cases will not notice the change. Two adapters today: the in-memory pair and the
SQLite pair. The repository and the queries are tested
together because they are two views of one store: what the repository saves is what the queries
must show."""

from collections.abc import Callable

import pytest

from architecture.domain.id import Id
from architecture.domain.result import Failure, Success
from architecture.infrastructure.data_sources import InMemoryDataSource
from contexts.notes.domain.note.dtos import NewNote, NoteSnapshot
from contexts.notes.domain.note.note import Note
from contexts.notes.domain.note.note_status import NoteStatus
from contexts.notes.domain.note.ports.note_queries import NoteDetail, NoteListItem, NoteQueries, SharedNoteListItem
from contexts.notes.domain.note.ports.note_repository import NoteRepository
from contexts.notes.infrastructure.notes_table import in_memory_database
from contexts.notes.infrastructure.queries import InMemoryNoteQueries, SqliteNoteQueries
from contexts.notes.infrastructure.repositories import InMemoryNoteRepository, SqliteNoteRepository

Persistence = tuple[NoteRepository, NoteQueries]


def in_memory() -> Persistence:
    data_source: InMemoryDataSource[NoteSnapshot] = InMemoryDataSource()
    return InMemoryNoteRepository(data_source), InMemoryNoteQueries(data_source)


def sqlite() -> Persistence:
    database = in_memory_database()
    return SqliteNoteRepository(database), SqliteNoteQueries(database)


adapters: list[Callable[[], Persistence]] = [in_memory, sqlite]

alice, bob = Id("alice"), Id("bob")


def a_note(owner: Id, title: str, content: str | None = None) -> Note:
    note = Note.create(NewNote(owner_id=owner.value, title=title, content=content or f"content of {title}"))
    assert isinstance(note, Success)
    return note.data


@pytest.fixture(params=adapters, ids=lambda open_: open_.__name__)
def persistence(request: pytest.FixtureRequest) -> Persistence:
    opened: Persistence = request.param()
    return opened


class TestNoteRepository:
    async def test_gives_back_an_equal_aggregate(self, persistence: Persistence) -> None:
        repository, _ = persistence
        note = a_note(alice, "Groceries")
        note.share_with(alice, bob)
        await repository.save(note)

        found = await repository.find_by_id(note.id.value)
        assert found is not None
        assert found.to_snapshot() == NoteSnapshot(
            id=note.id.value,
            owner_id="alice",
            title="Groceries",
            content="content of Groceries",
            status=NoteStatus.ACTIVE,
            shared_with=["bob"],
            version=note.version + 1,
        )

    async def test_stores_version_plus_one_and_refuses_an_aggregate_no_longer_at_the_stored_version(
        self, persistence: Persistence
    ) -> None:
        repository, _ = persistence
        note = a_note(alice, "Shared draft")
        assert note.version == 0
        await repository.save(note)

        # Two writers read the same version.
        mine = await repository.find_by_id(note.id.value)
        theirs = await repository.find_by_id(note.id.value)
        assert mine is not None and theirs is not None
        assert mine.version == 1

        mine.edit(alice, "Mine", "first")
        assert isinstance(await repository.save(mine), Success)

        theirs.edit(alice, "Theirs", "second")
        refused = await repository.save(theirs)
        assert isinstance(refused, Failure) and refused.error.type == "ConcurrencyConflict"

        stored = await repository.find_by_id(note.id.value)
        assert stored is not None
        assert (stored.title, stored.version) == ("Mine", 2)

    async def test_answers_none_for_an_unknown_id(self, persistence: Persistence) -> None:
        repository, _ = persistence
        assert await repository.find_by_id("nobody") is None

    async def test_saving_again_replaces_it_does_not_duplicate(self, persistence: Persistence) -> None:
        repository, queries = persistence
        note = a_note(alice, "Draft")
        await repository.save(note)
        # As a handler does: read it back, change it, save it; the instance saved before is stale.
        reread = await repository.find_by_id(note.id.value)
        assert reread is not None
        reread.edit(alice, "Final", "done")
        reread.archive(alice)
        assert isinstance(await repository.save(reread), Success)

        found = await repository.find_by_id(note.id.value)
        assert found is not None
        assert (found.title, found.status) == ("Final", NoteStatus.ARCHIVED)
        assert len(await queries.find_by_owner(alice.value)) == 1

    async def test_rebuilds_without_recording_events(self, persistence: Persistence) -> None:
        repository, _ = persistence
        note = a_note(alice, "Quiet")
        await repository.save(note)

        found = await repository.find_by_id(note.id.value)
        assert found is not None
        assert found.pull_domain_events() == []


class TestNoteQueries:
    async def test_shows_the_detail_of_a_saved_note(self, persistence: Persistence) -> None:
        repository, queries = persistence
        note = a_note(alice, "Groceries", "milk")
        note.share_with(alice, bob)
        await repository.save(note)

        assert await queries.find_by_id(note.id.value) == NoteDetail(
            id=note.id.value,
            title="Groceries",
            content="milk",
            status=NoteStatus.ACTIVE,
            owner_id="alice",
            shared_with=["bob"],
        )
        assert await queries.find_by_id("nobody") is None

    async def test_lists_an_owners_notes_and_only_theirs_in_the_order_they_were_saved(
        self, persistence: Persistence
    ) -> None:
        repository, queries = persistence
        first = a_note(alice, "First")
        second = a_note(alice, "Second")
        await repository.save(first)
        await repository.save(a_note(bob, "Not hers"))
        await repository.save(second)

        assert await queries.find_by_owner(alice.value) == [
            NoteListItem(id=first.id.value, title="First", status=NoteStatus.ACTIVE),
            NoteListItem(id=second.id.value, title="Second", status=NoteStatus.ACTIVE),
        ]
        assert await queries.find_by_owner("nobody") == []

    async def test_lists_the_notes_shared_with_an_account_whoever_owns_them(self, persistence: Persistence) -> None:
        repository, queries = persistence
        shared = a_note(alice, "Shared", "for bob")
        shared.share_with(alice, bob)
        kept = a_note(alice, "Kept")
        await repository.save(shared)
        await repository.save(kept)

        assert await queries.find_shared_with(bob.value) == [
            SharedNoteListItem(id=shared.id.value, title="Shared", content="for bob", owner_id="alice")
        ]
        assert await queries.find_shared_with(alice.value) == []
