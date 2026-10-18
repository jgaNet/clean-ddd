"""The read side over the in-memory store: each method shapes a read model from the snapshots,
which is the point of separating queries from the repository (ADR 5, QUERY-READ-MODELS). The
dict keeps insertion order, which is the order the port promises; test_persistence_contract.py
holds every adapter to it."""

from architecture.infrastructure.data_sources import InMemoryDataSource
from contexts.notes.domain.note.dtos import NoteSnapshot
from contexts.notes.domain.note.ports.note_queries import NoteDetail, NoteListItem, SharedNoteListItem


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
