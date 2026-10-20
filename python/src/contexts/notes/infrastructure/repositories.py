"""The repository port, twice: on the in-memory store (a snapshot in, a snapshot out) and on
SQLite, behind the same Protocol. The in-memory one It knows nothing
of the aggregate's rules (from_snapshot and to_snapshot are the aggregate's), and offers only
what a use case needs to change one aggregate: find it by id, save it. Searching and listing
are the queries' job (queries.py), on the same store.

``save()`` is where optimistic concurrency is enforced (ADR 8, CONC-OPTIMISTIC): the stored
version must still be the one the aggregate was read at, and the store gets version + 1.
"""

import sqlite3
from dataclasses import replace

from architecture.domain.common_exceptions import ConcurrencyConflictException
from architecture.domain.result import Failure, Result, Success
from architecture.infrastructure.data_sources import InMemoryDataSource
from contexts.notes.domain.note.dtos import NoteSnapshot
from contexts.notes.domain.note.note import Note
from contexts.notes.domain.note.note_exceptions import SERVICE
from contexts.notes.infrastructure.notes_table import create_notes_table, to_row, to_snapshot


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


class SqliteNoteRepository:
    """The same port as InMemoryNoteRepository, over a real database (the standard library's
    SQLite). It exists to prove the claim the ports make: the domain and the use cases did not
    change by one line to get here, and test_persistence_contract.py holds both adapters to the
    same expectations. The local wiring keeps the in-memory one."""

    def __init__(self, database: sqlite3.Connection) -> None:
        self._db = database
        create_notes_table(database)

    async def find_by_id(self, id: str) -> Note | None:  # noqa: A002
        row = self._db.execute("SELECT * FROM notes WHERE id = ?", (id,)).fetchone()
        return Note.from_snapshot(to_snapshot(row)) if row else None

    async def save(self, note: Note) -> Result[None]:
        """The optimistic check the way SQL makes it atomic: update only the row still at the
        version the aggregate was read at; no row changed means someone else wrote first (ADR 8)."""
        row = to_row(note.to_snapshot())
        with self._db:
            updated = self._db.execute(
                """
                UPDATE notes SET title = :title, content = :content, status = :status,
                  shared_with = :shared_with, version = :version + 1
                WHERE id = :id AND version = :version
                """,
                row,
            )
            if updated.rowcount > 0:
                return Success(None)

            stored = self._db.execute("SELECT version FROM notes WHERE id = ?", (row["id"],)).fetchone()
            if stored is not None:
                return Failure(stale_note(note.id.value, note.version, int(stored["version"])))

            self._db.execute(
                """
                INSERT INTO notes (id, owner_id, title, content, status, shared_with, version)
                VALUES (:id, :owner_id, :title, :content, :status, :shared_with, :version + 1)
                """,
                row,
            )
        return Success(None)
