"""The repository is the write side of persistence. It speaks in aggregates: it gives you a
Note back, and it takes a Note in. How and where it is stored is not the domain's concern; the
infrastructure layer provides an implementation.

It deliberately has no "search" method (listing and filtering belong to NoteQueries) and no
"next identity" method (the aggregate generates its own id in ``Note.create()``)."""

from typing import Protocol

from architecture.domain.result import Result
from contexts.notes.domain.note.note import Note


class NoteRepository(Protocol):
    async def find_by_id(self, id: str) -> Note | None: ...  # noqa: A002

    async def save(self, note: Note) -> Result[None]:
        """Stores the aggregate at version + 1, or refuses it with a ConcurrencyConflictException
        when the stored version is no longer the one it was loaded with: of two writers who read
        the same version, only the first wins (ADR 8). The contract test asserts it for every adapter."""
        ...
