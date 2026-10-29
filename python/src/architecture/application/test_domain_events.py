"""ADR 3 and ADR 24: durable with the state at commit, published from the outbox after it, never lost."""

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from architecture.application.domain_events import publish_domain_events
from architecture.application.execution_context import ExecutionContext
from architecture.application.operation import Operation
from architecture.application.outbox import OutboxEntry
from architecture.domain.aggregate_root import AggregateRoot
from architecture.domain.common_exceptions import NotAllowedException
from architecture.domain.event import DomainEvent, Event
from architecture.domain.id import Id
from architecture.domain.result import Failure, Result, Success
from architecture.infrastructure.outbox import InMemoryOutbox
from architecture.infrastructure.unit_of_work import InMemoryUnitOfWork


@dataclass(frozen=True)
class Greeted(DomainEvent):
    name: str


class Greeter(AggregateRoot):
    def greet(self, name: str) -> None:
        self._record(Greeted(name=name))


class RecordingBus:
    """What the bus really took, and under which message id; a call told to raise took nothing."""

    def __init__(self) -> None:
        self.published: list[Event] = []
        self.message_ids: list[str | None] = []
        self.fail_next = False

    async def connect(self) -> None: ...

    def publish[E: Event](self, event: E, context: ExecutionContext, message_id: str | None = None) -> Operation[E]:
        if self.fail_next:
            self.fail_next = False
            raise RuntimeError("the bus is down")
        self.published.append(event)
        self.message_ids.append(message_id)
        return Operation(event, context, id=message_id)

    async def dispatch(self, operation: Operation[Any]) -> Operation[Any]:
        return operation

    async def subscribe(self, channel: str, handler: object) -> None: ...


class RecordingOutbox(InMemoryOutbox):
    """Remembers the ids it handed out, so a test can compare them with the message ids."""

    def __init__(self) -> None:
        super().__init__()
        self.appended: list[str] = []

    def append(self, events: Sequence[Event]) -> list[OutboxEntry]:
        entries = super().append(events)
        self.appended.extend(entry.id for entry in entries)
        return entries


def context_with(outbox: InMemoryOutbox, bus: RecordingBus) -> ExecutionContext:
    return ExecutionContext(trace_id="trace", event_bus=bus, unit_of_work=InMemoryUnitOfWork([outbox.store], outbox))


def pending_events(outbox: InMemoryOutbox) -> list[Event]:
    return [entry.event for entry in outbox.pending()]


async def test_stores_at_commit_everything_the_aggregate_recorded_during_the_transaction_and_publishes_after() -> None:
    outbox, bus = InMemoryOutbox(), RecordingBus()
    context = context_with(outbox, bus)
    greeter = Greeter(Id("g"))

    async def work() -> Result[None]:
        greeter.greet("alice")
        publish_domain_events(greeter, context)
        greeter.greet("bob")  # recorded after the call, still inside the transaction
        assert outbox.pending() == []
        assert bus.published == []
        return Success(None)

    await context.with_transaction(work)
    assert bus.published == [Greeted(name="alice"), Greeted(name="bob")]
    assert greeter.pull_domain_events() == []
    assert outbox.pending() == []


async def test_publishes_each_fact_with_its_outbox_entry_as_the_message_id_so_the_bus_can_recognise_it() -> None:
    outbox, bus = RecordingOutbox(), RecordingBus()
    context = context_with(outbox, bus)
    greeter = Greeter(Id("g"))

    async def work() -> Result[None]:
        greeter.greet("alice")
        greeter.greet("bob")
        publish_domain_events(greeter, context)
        return Success(None)

    await context.with_transaction(work)
    assert len(outbox.appended) == 2
    assert bus.message_ids == outbox.appended


async def test_stores_nothing_and_leaves_the_events_on_the_aggregate_when_the_transaction_rolls_back() -> None:
    outbox, bus = InMemoryOutbox(), RecordingBus()
    context = context_with(outbox, bus)
    greeter = Greeter(Id("g"))

    async def work() -> Result[None]:
        greeter.greet("alice")
        publish_domain_events(greeter, context)
        return Failure(NotAllowedException("Test", "refused"))

    await context.with_transaction(work)
    assert bus.published == []
    assert outbox.pending() == []
    assert len(greeter.pull_domain_events()) == 1


async def test_keeps_a_fact_the_relay_could_not_publish_and_the_next_commit_publishes_it() -> None:
    """The window ADR 3 left open, closed: a fact the bus did not take is delayed, not lost."""
    outbox, bus = InMemoryOutbox(), RecordingBus()
    context = context_with(outbox, bus)
    greeter = Greeter(Id("g"))
    bus.fail_next = True

    async def first() -> Result[None]:
        greeter.greet("alice")
        publish_domain_events(greeter, context)
        return Success(None)

    await context.with_transaction(first)
    assert bus.published == []
    assert pending_events(outbox) == [Greeted(name="alice")]

    other = Greeter(Id("h"))

    async def second() -> Result[None]:
        other.greet("bob")
        publish_domain_events(other, context)
        return Success(None)

    await context.with_transaction(second)
    assert bus.published == [Greeted(name="alice"), Greeted(name="bob")]
    assert outbox.pending() == []


async def test_goes_straight_to_the_bus_once_the_use_case_succeeded_when_there_is_no_unit_of_work() -> None:
    bus = RecordingBus()
    context = ExecutionContext(trace_id="trace", event_bus=bus)
    greeter = Greeter(Id("g"))

    async def work() -> Result[None]:
        greeter.greet("alice")
        publish_domain_events(greeter, context)
        assert bus.published == []
        return Success(None)

    await context.with_transaction(work)
    assert bus.published == [Greeted(name="alice")]
    assert bus.message_ids == [None]


async def test_stores_and_publishes_at_once_outside_any_transaction_a_reaction_after_the_command_committed() -> None:
    """A reaction runs after the command's transaction committed, so it publishes outside any:
    the facts are stored and relayed on the spot, not left pending until the next commit."""
    outbox, bus = InMemoryOutbox(), RecordingBus()
    context = context_with(outbox, bus)
    greeter = Greeter(Id("g"))

    greeter.greet("alice")
    publish_domain_events(greeter, context)

    assert bus.published == [Greeted(name="alice")]
    assert outbox.pending() == []
    assert greeter.pull_domain_events() == []
