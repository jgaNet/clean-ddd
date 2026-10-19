"""The wiring of the Tracker context: the records store, the bus decorator the composition
root wraps the application's bus with, and the module of its two queries."""

from architecture.application.event_bus import EventBus
from architecture.application.module import Module
from architecture.infrastructure.data_sources import InMemoryDataSource
from contexts.tracker.application.queries.get_operation import GetOperationQueryHandler
from contexts.tracker.application.queries.get_operations import GetOperationsQueryHandler
from contexts.tracker.application.read_model import OperationRecord
from contexts.tracker.infrastructure.records import InMemoryOperationRecords
from contexts.tracker.infrastructure.tracked_event_bus import TrackedEventBus

OperationStore = InMemoryDataSource[OperationRecord]


def operation_store() -> OperationStore:
    return InMemoryDataSource()


def operation_records(store: OperationStore) -> InMemoryOperationRecords:
    return InMemoryOperationRecords(store)


def tracked_event_bus(bus: EventBus, records: InMemoryOperationRecords) -> TrackedEventBus:
    """The application's event bus: any bus, decorated so that every operation is recorded."""
    return TrackedEventBus(bus, records)


def local_tracker_module(records: InMemoryOperationRecords) -> Module:
    return Module(name="Tracker", queries=[GetOperationsQueryHandler(records), GetOperationQueryHandler(records)])
