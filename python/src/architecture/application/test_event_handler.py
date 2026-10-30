import asyncio
from dataclasses import dataclass
from typing import Any

import pytest

from architecture.application.domain_events import publish_integration_event
from architecture.application.event_handler import EventHandler
from architecture.application.execution_context import ExecutionContext
from architecture.application.operation import Operation, OperationStatus
from architecture.domain.common_exceptions import NotFoundException
from architecture.domain.event import DomainEvent, Event, IntegrationEvent
from architecture.domain.result import Failure, Result, Success
from architecture.infrastructure.data_sources import InMemoryDataSource
from architecture.infrastructure.outbox import InMemoryOutbox
from architecture.infrastructure.unit_of_work import InMemoryUnitOfWork


@dataclass(frozen=True)
class Greeted(DomainEvent):
    then: str = ""


class OnGreeted(EventHandler[Greeted]):
    def __init__(self) -> None:
        self.reacted = False

    async def execute(self, event: Greeted, context: ExecutionContext) -> Result[None]:
        if event.then == "throw":
            raise RuntimeError("boom")
        if event.then == "fail":
            return Failure(NotFoundException("Test", "Nothing to react to"))
        self.reacted = True
        return Success(None)


class NoBus:
    async def connect(self) -> None: ...

    def publish[E: Event](self, event: E, context: ExecutionContext, message_id: str | None = None) -> Operation[E]:
        raise AssertionError("not used")

    async def dispatch(self, operation: Operation[Any]) -> Operation[Any]:
        return operation

    async def subscribe(self, channel: str, handler: object) -> None: ...


def operation_for(event: Greeted) -> Operation[Greeted]:
    return Operation(event, ExecutionContext(trace_id="trace", event_bus=NoBus()))


async def test_marks_the_operation_sent_once_it_reacted() -> None:
    handler = OnGreeted()
    done = await handler.handle(operation_for(Greeted()))
    assert handler.reacted
    assert done.status is OperationStatus.SENT


async def test_records_a_failed_reaction_on_the_operation() -> None:
    done = await OnGreeted().handle(operation_for(Greeted(then="fail")))
    assert done.status is OperationStatus.ERROR
    assert isinstance(done.result, Failure) and done.result.error.type == "NotFound"


async def test_turns_a_raise_into_a_failed_operation_instead_of_an_unhandled_error() -> None:
    done = await OnGreeted().handle(operation_for(Greeted(then="throw")))
    assert done.status is OperationStatus.ERROR
    assert isinstance(done.result, Failure) and done.result.error.message == "boom"


# A reaction's transaction is its own (ADR 30): what it saves and what it tells other contexts commit
# together, or neither does.


@dataclass(frozen=True)
class Told(IntegrationEvent):
    who: str


class OnGreetedSaveAndTell(EventHandler[Greeted]):
    def __init__(self, store: InMemoryDataSource[str]) -> None:
        self._store = store

    async def execute(self, event: Greeted, context: ExecutionContext) -> Result[None]:
        await asyncio.sleep(0)
        for who in ("ann", "bob"):
            self._store.collection[who] = "told"
            publish_integration_event(Told(who=who), context)
            if event.then == "fail" and who == "bob":
                return Failure(NotFoundException("Test", "bob is gone"))
        return Success(None)


class RecordingBus(NoBus):
    def __init__(self) -> None:
        self.published: list[tuple[Event, str | None]] = []

    def publish[E: Event](self, event: E, context: ExecutionContext, message_id: str | None = None) -> Operation[E]:
        self.published.append((event, message_id))
        return Operation(event, context, id=message_id)


@dataclass
class Reaction:
    store: InMemoryDataSource[str]
    outbox: InMemoryOutbox
    unit_of_work: InMemoryUnitOfWork
    bus: RecordingBus

    def operation(self, event: Greeted) -> Operation[Greeted]:
        context = ExecutionContext(trace_id="trace", event_bus=self.bus, unit_of_work=self.unit_of_work)
        return Operation(event, context)


@pytest.fixture
def reaction() -> Reaction:
    store: InMemoryDataSource[str] = InMemoryDataSource()
    outbox = InMemoryOutbox()
    return Reaction(store, outbox, InMemoryUnitOfWork([store, outbox.store], outbox), RecordingBus())


async def test_a_reaction_commits_what_it_saved_and_tells_after_the_commit_through_the_outbox_under_the_entry_ids(
    reaction: Reaction,
) -> None:
    done = await OnGreetedSaveAndTell(reaction.store).handle(reaction.operation(Greeted()))

    assert done.status is OperationStatus.SENT
    assert list(reaction.store.collection) == ["ann", "bob"]
    assert [(event, isinstance(id, str)) for event, id in reaction.bus.published] == [
        (Told(who="ann"), True),
        (Told(who="bob"), True),
    ]
    assert reaction.outbox.pending() == []


async def test_a_reaction_that_fails_half_way_undoes_all_of_it_so_a_second_delivery_starts_clean(
    reaction: Reaction,
) -> None:
    done = await OnGreetedSaveAndTell(reaction.store).handle(reaction.operation(Greeted(then="fail")))

    assert done.status is OperationStatus.ERROR
    assert reaction.store.collection == {}
    assert reaction.bus.published == []
    assert reaction.outbox.pending() == []


async def test_a_reaction_runs_beside_another_to_the_same_fact_and_beside_the_open_transaction_that_published_it(
    reaction: Reaction,
) -> None:
    fact = reaction.operation(Greeted())
    await reaction.unit_of_work.begin_transaction()  # the publisher's, still open while it relays

    first, second = await asyncio.gather(
        OnGreetedSaveAndTell(reaction.store).handle(fact), OnGreetedSaveAndTell(reaction.store).handle(fact)
    )

    assert [first.status, second.status] == [OperationStatus.SENT, OperationStatus.SENT]
