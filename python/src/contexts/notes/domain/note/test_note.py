import pytest

from architecture.domain.id import Id
from architecture.domain.result import Failure, Success
from contexts.notes.domain.note.dtos import NewNote, NoteSnapshot
from contexts.notes.domain.note.events import (
    NoteArchivedEvent,
    NoteCreatedEvent,
    NoteEditedEvent,
    NotePinnedEvent,
    NoteRestoredEvent,
    NoteSharedEvent,
    NoteUnpinnedEvent,
)
from contexts.notes.domain.note.note import Note
from contexts.notes.domain.note.note_status import NoteStatus

owner = Id("alice")
stranger = Id("bob")


def a_note(title: str = "Groceries", content: str = "Milk") -> Note:
    note = Note.create(NewNote(owner_id=owner.value, title=title, content=content))
    assert isinstance(note, Success)
    note.data.pull_domain_events()
    return note.data


def an_archived_note() -> Note:
    note = a_note()
    assert note.archive(owner).is_success()
    note.pull_domain_events()
    return note


def a_pinned_note() -> Note:
    note = a_note()
    assert note.pin(owner).is_success()
    note.pull_domain_events()
    return note


def refusal_type(result: object) -> str:
    assert isinstance(result, Failure)
    return result.error.type


class TestWritingANote:
    def test_picks_its_own_identity_starts_active_unshared_and_records_note_created(self) -> None:
        result = Note.create(NewNote(owner_id="alice", title="  Groceries ", content="Milk"))

        assert isinstance(result, Success)
        note = result.data
        assert note.id.value
        assert note.status is NoteStatus.ACTIVE
        assert note.shared_with == []
        assert not note.pinned
        assert note.title == "Groceries"
        assert note.version == 0
        assert note.pull_domain_events() == [
            NoteCreatedEvent(note_id=note.id.value, owner_id="alice", title="Groceries")
        ]
        assert note.pull_domain_events() == []

    def test_gives_every_note_a_distinct_identity(self) -> None:
        assert not a_note().equals(a_note())

    def test_refuses_a_blank_title(self) -> None:
        assert refusal_type(Note.create(NewNote(owner_id="alice", title="   ", content=""))) == "BlankNoteTitle"


class TestEditingANote:
    def test_changes_title_and_content_and_records_note_edited(self) -> None:
        note = a_note()

        assert note.edit(owner, "Shopping", "Bread").is_success()

        assert (note.title, note.content) == ("Shopping", "Bread")
        assert note.pull_domain_events() == [NoteEditedEvent(note_id=note.id.value, title="Shopping")]

    def test_is_reserved_to_the_owner(self) -> None:
        note = a_note()
        assert refusal_type(note.edit(stranger, "Hacked", "")) == "NotNoteOwner"
        assert note.title == "Groceries"

    def test_is_refused_on_an_archived_note(self) -> None:
        assert refusal_type(an_archived_note().edit(owner, "Shopping", "Bread")) == "NoteArchived"

    def test_keeps_the_previous_title_when_the_new_one_is_invalid(self) -> None:
        note = a_note()
        assert refusal_type(note.edit(owner, "   ", "Bread")) == "BlankNoteTitle"
        assert (note.title, note.content) == ("Groceries", "Milk")
        assert note.pull_domain_events() == []


class TestArchivingAndRestoring:
    def test_archives_an_active_note_and_records_note_archived(self) -> None:
        note = a_note()
        assert note.archive(owner).is_success()
        assert note.status is NoteStatus.ARCHIVED
        assert note.pull_domain_events() == [NoteArchivedEvent(note_id=note.id.value)]

    def test_cannot_archive_twice(self) -> None:
        assert refusal_type(an_archived_note().archive(owner)) == "NoteAlreadyArchived"

    def test_restores_an_archived_note_and_records_note_restored(self) -> None:
        note = an_archived_note()
        assert note.restore(owner).is_success()
        assert note.status is NoteStatus.ACTIVE
        assert note.pull_domain_events() == [NoteRestoredEvent(note_id=note.id.value)]

    def test_cannot_restore_an_active_note(self) -> None:
        assert refusal_type(a_note().restore(owner)) == "NoteNotArchived"

    def test_is_reserved_to_the_owner(self) -> None:
        assert refusal_type(a_note().archive(stranger)) == "NotNoteOwner"
        assert refusal_type(an_archived_note().restore(stranger)) == "NotNoteOwner"


class TestPinningAndUnpinning:
    def test_pins_an_active_note_and_records_note_pinned(self) -> None:
        note = a_note()
        assert note.pin(owner).is_success()
        assert note.pinned
        assert note.pull_domain_events() == [NotePinnedEvent(note_id=note.id.value)]

    def test_cannot_pin_twice(self) -> None:
        assert refusal_type(a_pinned_note().pin(owner)) == "NoteAlreadyPinned"

    def test_cannot_pin_an_archived_note(self) -> None:
        note = an_archived_note()
        assert refusal_type(note.pin(owner)) == "NoteArchived"
        assert not note.pinned
        assert note.pull_domain_events() == []

    def test_unpins_a_pinned_note_and_records_note_unpinned(self) -> None:
        note = a_pinned_note()
        assert note.unpin(owner).is_success()
        assert not note.pinned
        assert note.pull_domain_events() == [NoteUnpinnedEvent(note_id=note.id.value)]

    def test_cannot_unpin_a_note_that_is_not_pinned(self) -> None:
        assert refusal_type(a_note().unpin(owner)) == "NoteNotPinned"

    def test_archiving_keeps_the_pin_and_the_owner_may_still_unpin(self) -> None:
        note = a_pinned_note()
        assert note.archive(owner).is_success()
        assert note.pinned
        assert note.unpin(owner).is_success()
        assert not note.pinned

    def test_is_reserved_to_the_owner(self) -> None:
        assert refusal_type(a_note().pin(stranger)) == "NotNoteOwner"
        assert refusal_type(a_pinned_note().unpin(stranger)) == "NotNoteOwner"


class TestSharing:
    def test_shares_with_another_account_and_records_note_shared(self) -> None:
        note = a_note()
        assert note.share_with(owner, stranger).is_success()
        assert note.shared_with == ["bob"]
        assert note.is_visible_to(stranger)
        assert not note.is_visible_to(Id("carol"))
        assert note.pull_domain_events() == [
            NoteSharedEvent(note_id=note.id.value, title="Groceries", owner_id="alice", recipient_id="bob")
        ]

    def test_cannot_share_with_yourself(self) -> None:
        assert refusal_type(a_note().share_with(owner, owner)) == "CannotShareWithSelf"

    def test_cannot_share_twice_with_the_same_account(self) -> None:
        note = a_note()
        note.share_with(owner, stranger)
        assert refusal_type(note.share_with(owner, stranger)) == "NoteAlreadyShared"

    def test_cannot_share_an_archived_note(self) -> None:
        assert refusal_type(an_archived_note().share_with(owner, stranger)) == "NoteArchived"

    def test_is_reserved_to_the_owner(self) -> None:
        assert refusal_type(a_note().share_with(stranger, Id("carol"))) == "NotNoteOwner"


class TestPersistenceRoundTrip:
    def test_rebuilds_the_full_state_from_a_snapshot_without_recording_any_event(self) -> None:
        snapshot = NoteSnapshot(
            id="n1",
            owner_id="alice",
            title="Groceries",
            content="Milk",
            status=NoteStatus.ARCHIVED,
            pinned=True,
            shared_with=["bob"],
            version=4,
        )

        note = Note.from_snapshot(snapshot)

        assert note.to_snapshot() == snapshot
        assert note.version == 4
        assert note.pull_domain_events() == []

    def test_gives_back_an_equal_note_after_to_snapshot_from_snapshot(self) -> None:
        note = a_note()
        note.share_with(owner, stranger)
        rebuilt = Note.from_snapshot(note.to_snapshot())
        assert rebuilt.equals(note)
        assert rebuilt.to_snapshot() == note.to_snapshot()

    def test_refuses_a_corrupted_snapshot(self) -> None:
        corrupted = NoteSnapshot(id="n1", owner_id="alice", title="  ", content="", status=NoteStatus.ACTIVE)
        with pytest.raises(ValueError, match="Corrupted note n1"):
            Note.from_snapshot(corrupted)
