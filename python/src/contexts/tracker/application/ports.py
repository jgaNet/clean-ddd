"""The store of the projection. Unlike an aggregate repository it is written by the projection
and read by the queries through the same interface: a read model has no invariants to protect,
so there is nothing to gain from splitting it."""

from typing import Protocol

from contexts.tracker.application.read_model import OperationRecord


class OperationRecords(Protocol):
    async def save(self, record: OperationRecord) -> None: ...

    async def find_by_id(self, id: str) -> OperationRecord | None: ...

    async def find_all(self) -> list[OperationRecord]: ...

    async def find_by_trace_id(self, trace_id: str) -> list[OperationRecord]: ...
