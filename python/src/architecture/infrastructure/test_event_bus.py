from dataclasses import dataclass
from typing import Any

from architecture.application.event_handler import EventHandler
from architecture.application.execution_context import ExecutionContext
from architecture.application.operation import Operation, OperationStatus
from architecture.domain.common_exceptions import UnknownException
from architecture.domain.event import DomainEvent, name_of
from architecture.domain.result import Failure, Result, Success
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


class Counter(EventHandler[Greeted]):
    """A reaction that counts, and fails when told to: the bus's inbox must remember only what was handled."""

    def __init__(self) -> None:
        self.seen: list[str] = []
        self.fail_next = False

    async def execute(self, event: Greeted, context: ExecutionContext) -> Result[None]:
        if self.fail_next:
            self.fail_next = False
            return Failure(UnknownException("not this time"))
        self.seen.append(event.name)
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


# Idempotent delivery (ADR 24): a message relayed twice from the outbox reaches a subscriber once.


async def test_delivers_a_message_once_per_subscriber_by_its_id_however_many_times_it_is_published() -> None:
    bus = InMemoryEventBus()
    counter = Counter()
    await bus.subscribe("Greeted", counter)
    context = ExecutionContext(trace_id="trace", event_bus=bus)

    bus.publish(Greeted(name="alice"), context, message_id="message-1")
    await bus.settle()
    again = bus.publish(Greeted(name="alice"), context, message_id="message-1")
    await bus.settle()

    assert counter.seen == ["alice"]
    assert status_of(again) is OperationStatus.SENT


async def test_delivers_two_messages_with_two_ids_and_the_same_event_without_an_id_as_often_as_published() -> None:
    bus = InMemoryEventBus()
    counter = Counter()
    await bus.subscribe("Greeted", counter)
    context = ExecutionContext(trace_id="trace", event_bus=bus)

    bus.publish(Greeted(name="alice"), context, message_id="message-1")
    bus.publish(Greeted(name="alice"), context, message_id="message-2")
    bus.publish(Greeted(name="bob"), context)
    bus.publish(Greeted(name="bob"), context)
    await bus.settle()

    assert counter.seen == ["alice", "alice", "bob", "bob"]


async def test_hands_a_message_again_to_a_subscriber_whose_reaction_failed_at_least_once_is_the_promise() -> None:
    bus = InMemoryEventBus()
    counter = Counter()
    await bus.subscribe("Greeted", counter)
    context = ExecutionContext(trace_id="trace", event_bus=bus)

    counter.fail_next = True
    bus.publish(Greeted(name="alice"), context, message_id="message-1")
    await bus.settle()
    assert counter.seen == []

    bus.publish(Greeted(name="alice"), context, message_id="message-1")
    await bus.settle()
    assert counter.seen == ["alice"]
