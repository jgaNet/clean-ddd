"""The transaction boundary over the in-memory stores. ``begin_transaction()`` snapshots every
store it was given (by default every InMemoryDataSource of the process), ``commit_transaction()``
drops the snapshots, and ``rollback_transaction()`` puts the stores back as they were: after a
rollback, nothing the transaction saved remains, which is what ExecutionContext.with_transaction()
promises.

Honest limit: the snapshot is of the whole store, so two transactions interleaving writes are
not isolated from each other; a rollback undoes everything written since it began, including
another request's work. What these four methods give you is a transaction *boundary*, not
isolation. A database gives both, through the same four methods (ADR 3). One instance per
request: see the bootstrap. Misuse (two begins, a commit with nothing open) is a programming
error and raises.
"""

from collections.abc import Callable, Iterable
from typing import Any

from architecture.infrastructure.data_sources import InMemoryDataSource


class InMemoryUnitOfWork:
    def __init__(self, stores: Iterable[InMemoryDataSource[Any]] | None = None) -> None:
        self._stores = stores if stores is not None else InMemoryDataSource.all
        self._restore: list[Callable[[], None]] | None = None

    async def begin_transaction(self) -> None:
        if self._restore is not None:
            raise RuntimeError("Transaction already in progress")
        self._restore = [store.snapshot() for store in self._stores]

    async def commit_transaction(self) -> None:
        if self._restore is None:
            raise RuntimeError("No active transaction to commit")
        self._restore = None

    async def rollback_transaction(self) -> None:
        if self._restore is None:
            raise RuntimeError("No active transaction to rollback")
        for restore in self._restore:
            restore()
        self._restore = None

    def has_active_transaction(self) -> bool:
        return self._restore is not None
