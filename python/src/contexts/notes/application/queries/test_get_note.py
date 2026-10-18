"""A query handler that holds a visibility rule has its happy path and its refusals tested."""

from architecture.domain.result import Failure, Success
from contexts.notes.application.commands.share_note import ShareNoteCommandEvent, ShareNoteCommandHandler
from contexts.notes.application.commands.test_commands import Fixture
from contexts.notes.application.queries.get_note import GetNoteQueryHandler
from contexts.notes.infrastructure.queries import InMemoryNoteQueries
from shared_kernel.domain.role import Role


async def a_note_shared_by_alice_with_bob(notes: Fixture) -> str:
    note_id = await notes.a_note_owned_by("alice")
    shared = await ShareNoteCommandHandler(notes.repository, notes.sharing).execute(
        ShareNoteCommandEvent(note_id=note_id, recipient_id="bob"), notes.context_for("alice")
    )
    assert isinstance(shared, Success)
    return note_id


async def test_shows_the_note_to_its_owner_and_to_whom_it_was_shared_with() -> None:
    notes = Fixture()
    note_id = await a_note_shared_by_alice_with_bob(notes)
    handler = GetNoteQueryHandler(InMemoryNoteQueries(notes.store))

    for reader in ("alice", "bob"):
        result = await handler.handle(note_id, notes.context_for(reader))
        assert isinstance(result, Success) and result.data.id == note_id and result.data.shared_with == ["bob"]


async def test_a_note_someone_else_owns_and_did_not_share_does_not_exist_as_far_as_you_know() -> None:
    notes = Fixture()
    note_id = await a_note_shared_by_alice_with_bob(notes)

    result = await GetNoteQueryHandler(InMemoryNoteQueries(notes.store)).handle(note_id, notes.context_for("carol"))
    assert isinstance(result, Failure) and result.error.type == "NoteNotFound"


async def test_refuses_an_anonymous_reader() -> None:
    notes = Fixture()
    note_id = await notes.a_note_owned_by("alice")

    result = await GetNoteQueryHandler(InMemoryNoteQueries(notes.store)).handle(
        note_id, notes.context_for(None, Role.GUEST)
    )
    assert isinstance(result, Failure) and result.error.type == "NotAllowed"
