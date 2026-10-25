from architecture.infrastructure.data_sources import InMemoryDataSource
from contexts.tracker.application.read_model import OperationRecord


class InMemoryOperationRecords:
    def __init__(self, data_source: InMemoryDataSource[OperationRecord]) -> None:
        self._data_source = data_source

    async def save(self, record: OperationRecord) -> None:
        self._data_source.collection[record.id] = record

    async def find_by_id(self, id: str) -> OperationRecord | None:
        return self._data_source.collection.get(id)

    async def find_all(self) -> list[OperationRecord]:
        return list(self._data_source.collection.values())

    async def find_by_trace_id(self, trace_id: str) -> list[OperationRecord]:
        return [record for record in self._data_source.collection.values() if record.trace_id == trace_id]
