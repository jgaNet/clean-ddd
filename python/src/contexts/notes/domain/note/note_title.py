"""NoteTitle is a value object: it has no identity, it is immutable, and it cannot exist in an
invalid state. Once you hold a NoteTitle you know it is non-blank and short enough. The
validation lives here, in one place, instead of being repeated wherever a title enters the
system (creation, edition, import...)."""

from dataclasses import dataclass

from architecture.domain.result import Failure, Result, Success
from architecture.domain.value_object import ValueObject
from contexts.notes.domain.note.note_exceptions import BlankNoteTitleException, NoteTitleTooLongException


@dataclass(frozen=True, slots=True)
class NoteTitle(ValueObject[str]):
    MAX_LENGTH = 100

    @staticmethod
    def create(raw: str) -> Result["NoteTitle"]:
        title = raw.strip()
        if not title:
            return Failure(BlankNoteTitleException())
        if len(title) > NoteTitle.MAX_LENGTH:
            return Failure(NoteTitleTooLongException(NoteTitle.MAX_LENGTH, len(title)))
        return Success(NoteTitle(title))
