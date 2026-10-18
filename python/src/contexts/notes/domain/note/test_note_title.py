from architecture.domain.result import Failure, Success
from contexts.notes.domain.note.note_title import NoteTitle


def test_accepts_a_title_and_trims_it() -> None:
    title = NoteTitle.create("  Groceries ")
    assert title == Success(NoteTitle("Groceries"))


def test_refuses_a_blank_title_and_one_too_long() -> None:
    blank = NoteTitle.create("   ")
    too_long = NoteTitle.create("x" * (NoteTitle.MAX_LENGTH + 1))
    assert isinstance(blank, Failure) and blank.error.type == "BlankNoteTitle"
    assert isinstance(too_long, Failure) and too_long.error.type == "NoteTitleTooLong"
    assert too_long.error.context == {"maxLength": 100, "actualLength": 101}


def test_compares_by_value() -> None:
    assert NoteTitle.create("a") == NoteTitle.create("a")
    assert NoteTitle.create("a") != NoteTitle.create("b")
