from dataclasses import dataclass
from typing import Any

from architecture.application.event_handler import EventHandler
from architecture.application.execution_context import ExecutionContext
from architecture.application.operation import Operation, OperationStatus
from architecture.domain.event import DomainEvent, name_of
from architecture.domain.result import Result, Success
from architecture.infrastructure.event_bus import InMemoryEventBus


@dataclass(frozen=True)
class Greeted(DomainEvent):
    name: str


@dataclass(frozen=True)
class Waved(DomainEvent):
    pass


class Recorder(EventHandler[Greeted]):
    def __init__(self) -> None:
        self.seen: list[str] = []

    async def execute(self, event: Greeted, context: ExecutionContext) -> Result[None]:
        self.seen.append(f"{name_of(event)} {event.name}")
        return Success(None)


def status_of(operation: Operation[Any]) -> OperationStatus:
    """Read through a function, so the type checker does not narrow the status between two asserts."""
    return operation.status


async def test_answers_with_the_operation_before_the_handling_and_routes_by_name() -> None:
    bus = InMemoryEventBus()
    recorder = Recorder()
    await bus.subscribe("Greeted", recorder)
    context = ExecutionContext(trace_id="trace", event_bus=bus)

    operation = bus.publish(Greeted(name="alice"), context)
    assert status_of(operation) is OperationStatus.PENDING
    assert recorder.seen == []

    await bus.settle()
    assert recorder.seen == ["Greeted alice"]
    assert status_of(operation) is OperationStatus.SENT


async def test_an_event_nobody_listens_to_is_dispatched_to_no_one() -> None:
    bus = InMemoryEventBus()
    operation = bus.publish(Waved(), ExecutionContext(trace_id="trace", event_bus=bus))
    await bus.settle()
    assert operation.status is OperationStatus.PENDING
