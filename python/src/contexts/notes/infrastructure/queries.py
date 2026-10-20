"""The read side, twice: over the in-memory store, where each method shapes a read model from
the snapshots, and over SQLite, where each query is one SQL statement shaped for its read model;
that is the point of separating queries from the repository (ADR 5, QUERY-READ-MODELS). The
dict keeps insertion order and the table its rowid, which is the order the port promises;
test_persistence_contract.py holds every adapter to it."""

import sqlite3

from architecture.infrastructure.data_sources import InMemoryDataSource
from contexts.notes.domain.note.dtos import NoteSnapshot
from contexts.notes.domain.note.note_status import NoteStatus
from contexts.notes.domain.note.ports.note_queries import NoteDetail, NoteListItem, SharedNoteListItem
from contexts.notes.infrastructure.notes_table import create_notes_table, to_snapshot


class InMemoryNoteQueries:
    def __init__(self, data_source: InMemoryDataSource[NoteSnapshot]) -> None:
        self._data_source = data_source

    async def find_by_id(self, note_id: str) -> NoteDetail | None:
        note = self._data_source.collection.get(note_id)
        if note is None:
            return None
        return NoteDetail(
            id=note.id,
            title=note.title,
            status=note.status,
            owner_id=note.owner_id,
            content=note.content,
            shared_with=list(note.shared_with),
        )

    async def find_by_owner(self, owner_id: str) -> list[NoteListItem]:
        return [
            NoteListItem(id=note.id, title=note.title, status=note.status)
            for note in self._all()
            if note.owner_id == owner_id
        ]

    async def find_shared_with(self, account_id: str) -> list[SharedNoteListItem]:
        return [
            SharedNoteListItem(id=note.id, title=note.title, content=note.content, owner_id=note.owner_id)
            for note in self._all()
            if account_id in note.shared_with
        ]

    def _all(self) -> list[NoteSnapshot]:
        return list(self._data_source.collection.values())


class SqliteNoteQueries:
    def __init__(self, database: sqlite3.Connection) -> None:
        self._db = database
        create_notes_table(database)

    async def find_by_id(self, note_id: str) -> NoteDetail | None:
        row = self._db.execute("SELECT * FROM notes WHERE id = ?", (note_id,)).fetchone()
        if row is None:
            return None
        note = to_snapshot(row)
        return NoteDetail(
            id=note.id,
            title=note.title,
            status=note.status,
            owner_id=note.owner_id,
            content=note.content,
            shared_with=note.shared_with,
        )

    async def find_by_owner(self, owner_id: str) -> list[NoteListItem]:
        rows = self._db.execute(
            "SELECT id, title, status FROM notes WHERE owner_id = ? ORDER BY rowid", (owner_id,)
        ).fetchall()
        return [NoteListItem(id=row["id"], title=row["title"], status=NoteStatus(row["status"])) for row in rows]

    async def find_shared_with(self, account_id: str) -> list[SharedNoteListItem]:
        rows = self._db.execute(
            """
            SELECT id, title, content, owner_id FROM notes
            WHERE EXISTS (SELECT 1 FROM json_each(notes.shared_with) WHERE value = ?)
            ORDER BY rowid
            """,
            (account_id,),
        ).fetchall()
        return [
            SharedNoteListItem(id=row["id"], title=row["title"], content=row["content"], owner_id=row["owner_id"])
            for row in rows
        ]
