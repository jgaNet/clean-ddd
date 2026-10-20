from dataclasses import dataclass

from architecture.application.command_handler import CommandHandler
from architecture.application.event_handler import EventHandler
from architecture.application.execution_context import Auth, ExecutionContext
from architecture.application.operation import OperationStatus
from architecture.domain.common_exceptions import NotFoundException
from architecture.domain.event import CommandEvent, DomainEvent
from architecture.domain.result import Failure, Result, Success
from architecture.infrastructure.data_sources import InMemoryDataSource
from architecture.infrastructure.event_bus import InMemoryEventBus
from contexts.tracker.application.read_model import OperationError, OperationRecord
from contexts.tracker.infrastructure.records import InMemoryOperationRecords
from contexts.tracker.infrastructure.tracked_event_bus import TrackedEventBus
from shared_kernel.application.integration_events.tracker_integration_events import (
    OperationCompleteIntegrationEvent,
)


@dataclass(frozen=True)
class Greet(CommandEvent):
    who: str


@dataclass(frozen=True)
class Greeted(DomainEvent):
    who: str


class GreetHandler(CommandHandler[Greet]):
    async def execute(self, command: Greet, context: ExecutionContext) -> Result[str]:
        if command.who == "nobody":
            return Failure(NotFoundException("Test", "Nobody to greet"))
        context.event_bus.publish(Greeted(who=command.who), context)
        return Success(f"Hello {command.who}")


class OnGreeted(EventHandler[Greeted]):
    async def execute(self, event: Greeted, context: ExecutionContext) -> Result[None]:
        return Success(None)


class CompletionRecorder(EventHandler[OperationCompleteIntegrationEvent]):
    """Stands in for the Notifications context: keeps the completion notices it receives."""

    def __init__(self) -> None:
        self.completions: list[OperationCompleteIntegrationEvent] = []

    async def execute(self, event: OperationCompleteIntegrationEvent, context: ExecutionContext) -> Result[None]:
        self.completions.append(event)
        return Success(None)


class Setup:
    def __init__(self) -> None:
        self.store: InMemoryDataSource[OperationRecord] = InMemoryDataSource()
        self.bus = TrackedEventBus(InMemoryEventBus(), InMemoryOperationRecords(self.store))
        self.completions = CompletionRecorder()

    async def subscribed(self) -> "Setup":
        await self.bus.subscribe("Greet", GreetHandler())
        await self.bus.subscribe("Greeted", OnGreeted())
        await self.bus.subscribe("OperationCompleteIntegrationEvent", self.completions)
        return self

    def context_for(self, subject_id: str | None) -> ExecutionContext:
        return ExecutionContext(trace_id="trace-1", event_bus=self.bus, auth=Auth(subject_id=subject_id, role="USER"))

    def records(self) -> list[tuple[str, str]]:
        return [(record.name, record.status.value) for record in self.store.collection.values()]


async def test_records_a_command_up_to_its_outcome_and_the_events_it_set_off_under_the_same_trace() -> None:
    setup = await Setup().subscribed()

    operation = setup.bus.publish(Greet(who="Alice"), setup.context_for("alice"))
    await setup.bus.settle()

    record = setup.store.collection[operation.id]
    assert (record.name, record.status, record.trace_id, record.subject_id) == (
        "Greet",
        OperationStatus.SUCCESS,
        "trace-1",
        "alice",
    )
    assert record.result == "Hello Alice"
    assert setup.records() == [("Greet", "SUCCESS"), ("Greeted", "SENT")]


async def test_records_a_failed_operation_with_the_error_in_client_words() -> None:
    setup = await Setup().subscribed()

    operation = setup.bus.publish(Greet(who="nobody"), setup.context_for("alice"))
    await setup.bus.settle()

    record = setup.store.collection[operation.id]
    assert record.status is OperationStatus.ERROR
    assert record.error == OperationError(type="NotFound", message="Nobody to greet")


async def test_announces_the_outcome_of_an_authenticated_callers_command_once_and_nothing_else() -> None:
    setup = await Setup().subscribed()

    setup.bus.publish(Greet(who="Alice"), setup.context_for("alice"))
    setup.bus.publish(Greet(who="nobody"), setup.context_for("alice"))
    setup.bus.publish(Greet(who="Carol"), setup.context_for(None))
    setup.bus.publish(Greeted(who="Dave"), setup.context_for("alice"))
    await setup.bus.settle()

    announced = [(notice.type, notice.status) for notice in setup.completions.completions]
    assert announced == [("Greet", "SUCCESS"), ("Greet", "ERROR")]
    assert setup.completions.completions[0].result == "Hello Alice"
    assert setup.completions.completions[1].error == "Nobody to greet"
    # The notice itself is never recorded; a domain event is recorded for the trace, never announced.
    names = [name for name, _ in setup.records()]
    assert "OperationCompleteIntegrationEvent" not in names
    assert names.count("Greet") == 3 and ("Greeted", "SENT") in setup.records()
