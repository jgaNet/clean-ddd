"""The repository port on the in-memory store: a snapshot in, a snapshot out. It knows nothing
of the aggregate's rules (from_snapshot and to_snapshot are the aggregate's), and offers only
what a use case needs to change one aggregate: find it by id, save it. Searching and listing
are the queries' job (queries.py), on the same store.

``save()`` is where optimistic concurrency is enforced (ADR 8, CONC-OPTIMISTIC): the stored
version must still be the one the aggregate was read at, and the store gets version + 1.
"""

from dataclasses import replace

from architecture.domain.common_exceptions import ConcurrencyConflictException
from architecture.domain.result import Failure, Result, Success
from architecture.infrastructure.data_sources import InMemoryDataSource
from contexts.notes.domain.note.dtos import NoteSnapshot
from contexts.notes.domain.note.note import Note
from contexts.notes.domain.note.note_exceptions import SERVICE


def stale_note(note_id: str, read: int, stored: int) -> ConcurrencyConflictException:
    return ConcurrencyConflictException(
        SERVICE, "The note changed since it was read", {"noteId": note_id, "read": read, "stored": stored}
    )


class InMemoryNoteRepository:
    def __init__(self, data_source: InMemoryDataSource[NoteSnapshot]) -> None:
        self._data_source = data_source

    async def find_by_id(self, id: str) -> Note | None:  # noqa: A002
        snapshot = self._data_source.collection.get(id)
        return Note.from_snapshot(snapshot) if snapshot else None

    async def save(self, note: Note) -> Result[None]:
        stored = self._data_source.collection.get(note.id.value)
        if stored and stored.version != note.version:
            return Failure(stale_note(note.id.value, note.version, stored.version))
        self._data_source.collection[note.id.value] = replace(note.to_snapshot(), version=note.version + 1)
        return Success(None)
