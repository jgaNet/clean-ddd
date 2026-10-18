from architecture.domain.id import Id
from architecture.domain.result import Failure, Success
from contexts.notes.domain.note.dtos import NewNote
from contexts.notes.domain.note.note import Note
from contexts.notes.domain.note.note_sharing import NoteSharing


class Directory:
    """A domain test needs only the port: a list of known ids is a directory."""

    def __init__(self, *known: str) -> None:
        self._known = known

    async def exists(self, account_id: str) -> bool:
        return account_id in self._known


alice, bob = Id("alice"), Id("bob")


def a_note_of(owner: Id) -> Note:
    note = Note.create(NewNote(owner_id=owner.value, title="Groceries", content="Milk"))
    assert isinstance(note, Success)
    return note.data


async def test_shares_with_an_account_the_directory_knows() -> None:
    note = a_note_of(alice)
    result = await NoteSharing(Directory("alice", "bob")).share(note, alice, bob)
    assert result.is_success()
    assert note.shared_with == ["bob"]


async def test_refuses_an_account_the_directory_does_not_know_before_the_aggregate_is_touched() -> None:
    note = a_note_of(alice)
    result = await NoteSharing(Directory("alice")).share(note, alice, bob)
    assert isinstance(result, Failure) and result.error.type == "RecipientNotFound"
    assert note.shared_with == []


async def test_still_leaves_the_notes_own_rules_to_the_aggregate() -> None:
    note = a_note_of(alice)
    result = await NoteSharing(Directory("alice", "bob")).share(note, bob, alice)
    assert isinstance(result, Failure) and result.error.type == "NotNoteOwner"
