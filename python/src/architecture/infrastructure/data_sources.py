"""A dict used as a database. Repositories and queries of a context share one instance, which
is all the "persistence" this reference project needs: the ports they implement are what a real
database adapter would implement instead.

Every instance registers itself, so that the in-memory unit of work can snapshot all the stores
of the process when a transaction begins and put them back if it rolls back. A database would
keep that undo log itself; here the store does. The dict keeps insertion order, which is the
order the queries promise.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any, ClassVar


class InMemoryDataSource[M]:
    all: ClassVar[set[InMemoryDataSource[Any]]] = set()

    def __init__(self) -> None:
        self.collection: dict[str, M] = {}
        InMemoryDataSource.all.add(self)

    def reset_collection(self) -> None:
        self.collection = {}

    def snapshot(self) -> Callable[[], None]:
        """A copy of the store as it is now, and the way to put it back."""
        copy = dict(self.collection)

        def restore() -> None:
            self.collection = dict(copy)

        return restore
