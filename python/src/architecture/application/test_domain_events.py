from dataclasses import dataclass
from typing import Any

from architecture.application.domain_events import publish_domain_events
from architecture.application.execution_context import ExecutionContext
from architecture.application.operation import Operation
from architecture.domain.aggregate_root import AggregateRoot
from architecture.domain.common_exceptions import NotAllowedException
from architecture.domain.event import DomainEvent, Event
from architecture.domain.id import Id
from architecture.domain.result import Failure, Result, Success


@dataclass(frozen=True)
class Greeted(DomainEvent):
    name: str


class Greeter(AggregateRoot):
    def greet(self, name: str) -> None:
        self._record(Greeted(name=name))


class RecordingBus:
    def __init__(self) -> None:
        self.published: list[Event] = []

    async def connect(self) -> None: ...

    def publish[E: Event](self, event: E, context: ExecutionContext) -> Operation[E]:
        self.published.append(event)
        return Operation(event, context)

    async def dispatch(self, operation: Operation[Any]) -> Operation[Any]:
        return operation

    async def subscribe(self, channel: str, handler: object) -> None: ...


async def test_publishes_after_the_commit_everything_the_aggregate_recorded_during_the_transaction() -> None:
    bus = RecordingBus()
    context = ExecutionContext(trace_id="trace", event_bus=bus)
    greeter = Greeter(Id("g"))

    async def work() -> Result[None]:
        greeter.greet("alice")
        publish_domain_events(greeter, context)
        greeter.greet("bob")  # recorded after the call, still inside the transaction
        assert bus.published == []
        return Success(None)

    await context.with_transaction(work)
    assert bus.published == [Greeted(name="alice"), Greeted(name="bob")]
    assert greeter.pull_domain_events() == []


async def test_leaves_the_events_on_the_aggregate_unpublished_when_the_transaction_rolls_back() -> None:
    bus = RecordingBus()
    context = ExecutionContext(trace_id="trace", event_bus=bus)
    greeter = Greeter(Id("g"))

    async def work() -> Result[None]:
        greeter.greet("alice")
        publish_domain_events(greeter, context)
        return Failure(NotAllowedException("Test", "refused"))

    await context.with_transaction(work)
    assert bus.published == []
    assert len(greeter.pull_domain_events()) == 1
