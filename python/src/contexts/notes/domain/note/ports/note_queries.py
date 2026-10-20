"""Read models: the shapes a screen or an API wants to display. They are plain data, tailored
to a use case, and they never come back into the domain.

The queries port is the read side (the "Q" of CQRS). It returns read models, not aggregates, so
the read side is free to be shaped, indexed and cached however the screens need, without
dragging the business rules along (ADR 5)."""

from dataclasses import dataclass, field
from typing import Protocol

from contexts.notes.domain.note.note_status import NoteStatus


@dataclass(frozen=True)
class NoteListItem:
    id: str
    title: str
    status: NoteStatus
    pinned: bool


@dataclass(frozen=True)
class NoteDetail:
    id: str
    title: str
    status: NoteStatus
    owner_id: str
    content: str
    pinned: bool
    shared_with: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class SharedNoteListItem:
    id: str
    title: str
    content: str
    owner_id: str


class NoteQueries(Protocol):
    async def find_by_id(self, note_id: str) -> NoteDetail | None: ...

    async def find_by_owner(self, owner_id: str) -> list[NoteListItem]:
        """Pinned notes first, then the others, each group in the order they were saved. Ordering
        is part of this contract: the contract test asserts it for every adapter. An unknown
        owner gets an empty list."""
        ...

    async def find_shared_with(self, account_id: str) -> list[SharedNoteListItem]:
        """In the order they were saved."""
        ...
