"""The outbox over an in-memory store (ADR 24). It is an InMemoryDataSource like any other, so
the in-memory unit of work snapshots it when a transaction begins and puts it back on a
rollback: an entry appended by a transaction that fails is gone with the transaction's other
writes, which is the whole point of writing the facts where the state is. Insertion order is
publication order; a published entry is dropped rather than flagged, since nothing here reads
history. One per process, shared by every request's unit of work (see the bootstrap).
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import ClassVar
from uuid import uuid4

from architecture.application.outbox import OutboxEntry
from architecture.domain.event import Event
from architecture.infrastructure.data_sources import InMemoryDataSource


class InMemoryOutbox:
    #: The process's outbox, for a unit of work built without one: tests, and the bootstrap's default.
    shared: ClassVar[InMemoryOutbox]

    def __init__(self) -> None:
        self.store: InMemoryDataSource[OutboxEntry] = InMemoryDataSource()

    def append(self, events: Sequence[Event]) -> list[OutboxEntry]:
        entries = [OutboxEntry(id=str(uuid4()), event=event) for event in events]
        for entry in entries:
            self.store.collection[entry.id] = entry
        return entries

    def pending(self) -> list[OutboxEntry]:
        return list(self.store.collection.values())

    def mark_published(self, id: str) -> None:
        self.store.collection.pop(id, None)


InMemoryOutbox.shared = InMemoryOutbox()
