"""Snapshot of a Note: the plain data the aggregate is persisted as and rebuilt from.

The aggregate (note.py) owns the behaviour and the rules; these types own nothing. The snapshot
is the only shape that crosses the domain boundary towards the infrastructure."""

from dataclasses import dataclass, field

from contexts.notes.domain.note.note_status import NoteStatus


@dataclass(frozen=True)
class NoteSnapshot:
    id: str
    owner_id: str
    title: str
    content: str
    status: NoteStatus
    shared_with: list[str] = field(default_factory=list)
    #: The version this snapshot was read at; the repository stores version + 1 (ADR 8).
    version: int = 0


@dataclass(frozen=True)
class NewNote:
    """What is needed to write a brand new note."""

    owner_id: str
    title: str
    content: str
