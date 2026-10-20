"""The one table behind the SQLite adapters, and the two conversions between a row and the
snapshot the aggregate is rebuilt from. The repository and the queries share it, the way their
in-memory counterparts share one InMemoryDataSource: same store, two ports; a ``sqlite3``
connection, which serialises its writers anyway.

``shared_with`` is a JSON array; SQLite's ``json_each()`` lets the queries filter on it without
a second table, which is all this reference needs. A real schema would normalise it.

``CREATE TABLE IF NOT EXISTS`` is enough because the store is created per process (an in-memory
database in tests). A file database that outlives the code would need a migration for every new
column; this reference has no migration mechanism, on purpose. The driver is synchronous: the
adapters call it inline, which an in-memory database does not feel; a file database under load
would run its statements in a thread, behind the same ports.
"""

import json
import sqlite3

from contexts.notes.domain.note.dtos import NoteSnapshot
from contexts.notes.domain.note.note_status import NoteStatus


def in_memory_database() -> sqlite3.Connection:
    """Opens an in-memory database with the notes table: what a test, or a wiring, starts from."""
    connection = sqlite3.connect(":memory:")
    connection.row_factory = sqlite3.Row
    create_notes_table(connection)
    return connection


def create_notes_table(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS notes (
          id          TEXT PRIMARY KEY,
          owner_id    TEXT NOT NULL,
          title       TEXT NOT NULL,
          content     TEXT NOT NULL,
          status      TEXT NOT NULL,
          shared_with TEXT NOT NULL,
          version     INTEGER NOT NULL
        )
        """
    )


def to_row(note: NoteSnapshot) -> dict[str, str | int]:
    return {
        "id": note.id,
        "owner_id": note.owner_id,
        "title": note.title,
        "content": note.content,
        "status": note.status.value,
        "shared_with": json.dumps(note.shared_with),
        "version": note.version,
    }


def to_snapshot(row: sqlite3.Row) -> NoteSnapshot:
    """A full row of the table, as the aggregate is rebuilt from it."""
    status = NoteStatus(row["status"])
    return NoteSnapshot(
        id=row["id"],
        owner_id=row["owner_id"],
        title=row["title"],
        content=row["content"],
        status=status,
        shared_with=list(json.loads(row["shared_with"])),
        version=int(row["version"]),
    )
