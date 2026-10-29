from dataclasses import dataclass
from typing import Any

from architecture.application.execution_context import Auth, ExecutionContext, UnitOfWork
from architecture.application.operation import Operation
from architecture.domain.common_exceptions import UnknownException
from architecture.domain.event import DomainEvent, Event
from architecture.domain.result import Failure, Result, Success
from architecture.infrastructure.outbox import InMemoryOutbox


@dataclass(frozen=True)
class Fact(DomainEvent):
    pass


class NoBus:
    """A context needs a bus; these tests never publish."""

    async def connect(self) -> None: ...

    def publish[E: Event](self, event: E, context: ExecutionContext, message_id: str | None = None) -> Operation[E]:
        raise AssertionError("not used")

    async def dispatch(self, operation: Operation[Event]) -> Operation[Event]:
        raise AssertionError("not used")

    async def subscribe(self, channel: str, handler: object) -> None: ...


class LoggingBus(NoBus):
    """Writes "publish" in the unit of work's log, so the relay shows where it happened."""

    def __init__(self, log: list[str]) -> None:
        self.log = log

    def publish[E: Event](self, event: E, context: ExecutionContext, message_id: str | None = None) -> Operation[E]:
        self.log.append("publish")
        return Operation(event, context, id=message_id)


class FakeUnitOfWork:
    def __init__(self) -> None:
        self.active = False
        self.log: list[str] = []
        self.outbox = InMemoryOutbox()

    async def begin_transaction(self) -> None:
        self.active = True
        self.log.append("begin")

    async def commit_transaction(self) -> None:
        self.active = False
        self.log.append("commit")

    async def rollback_transaction(self) -> None:
        self.active = False
        self.log.append("rollback")

    def has_active_transaction(self) -> bool:
        return self.active


def context_with(unit_of_work: UnitOfWork | None = None, bus: Any = None) -> ExecutionContext:
    return ExecutionContext(trace_id="trace", event_bus=bus or NoBus(), auth=Auth(), unit_of_work=unit_of_work)


OK: Result[None] = Success(None)


async def test_runs_the_callback_only_once_the_transaction_is_committed() -> None:
    unit_of_work = FakeUnitOfWork()
    context = context_with(unit_of_work)

    async def work() -> Result[None]:
        context.after_commit(lambda: unit_of_work.log.append("callback"))
        unit_of_work.log.append("work")
        return OK

    await context.with_transaction(work)
    assert unit_of_work.log == ["begin", "work", "commit", "callback"]


async def test_runs_a_before_commit_step_inside_the_transaction_after_the_work_then_relays_the_outbox() -> None:
    unit_of_work = FakeUnitOfWork()
    context = context_with(unit_of_work, LoggingBus(unit_of_work.log))

    def before_commit() -> None:
        unit_of_work.log.append("before commit")
        unit_of_work.outbox.append([Fact()])

    async def work() -> Result[None]:
        context.after_commit(lambda: unit_of_work.log.append("callback"))
        context.before_commit(before_commit)
        unit_of_work.log.append("work")
        return OK

    await context.with_transaction(work)
    assert unit_of_work.log == ["begin", "work", "before commit", "commit", "publish", "callback"]
    assert unit_of_work.outbox.pending() == []


async def test_drops_the_before_commit_step_with_the_callback_when_the_transaction_fails() -> None:
    unit_of_work = FakeUnitOfWork()
    context = context_with(unit_of_work)

    async def work() -> Result[None]:
        context.before_commit(lambda: unit_of_work.log.append("before commit"))
        context.after_commit(lambda: unit_of_work.log.append("callback"))
        return Failure(UnknownException("nope"))

    await context.with_transaction(work)
    assert unit_of_work.log == ["begin", "rollback"]


def test_runs_a_before_commit_step_at_once_outside_of_a_transaction_and_relays_the_outbox() -> None:
    unit_of_work = FakeUnitOfWork()
    context = context_with(unit_of_work, LoggingBus(unit_of_work.log))

    def step() -> None:
        unit_of_work.log.append("step")
        unit_of_work.outbox.append([Fact()])

    context.before_commit(step)
    assert unit_of_work.log == ["step", "publish"]
    assert unit_of_work.outbox.pending() == []


async def test_drops_the_callback_when_the_transaction_fails() -> None:
    unit_of_work = FakeUnitOfWork()
    context = context_with(unit_of_work)

    async def work() -> Result[None]:
        context.after_commit(lambda: unit_of_work.log.append("callback"))
        return Failure(UnknownException("nope"))

    await context.with_transaction(work)
    assert unit_of_work.log == ["begin", "rollback"]


async def test_drops_the_callback_when_the_transaction_raises() -> None:
    unit_of_work = FakeUnitOfWork()
    context = context_with(unit_of_work)

    async def work() -> Result[None]:
        context.after_commit(lambda: unit_of_work.log.append("callback"))
        raise RuntimeError("boom")

    result = await context.with_transaction(work)
    assert isinstance(result, Failure) and result.error.message == "boom"
    assert unit_of_work.log == ["begin", "rollback"]


async def test_runs_the_callback_at_the_outermost_commit_when_transactions_are_nested() -> None:
    unit_of_work = FakeUnitOfWork()
    context = context_with(unit_of_work)

    async def inner() -> Result[None]:
        context.after_commit(lambda: unit_of_work.log.append("inner callback"))
        return OK

    async def outer() -> Result[None]:
        await context.with_transaction(inner)
        unit_of_work.log.append("outer work")
        return OK

    await context.with_transaction(outer)
    assert unit_of_work.log == ["begin", "outer work", "commit", "inner callback"]


def test_runs_the_callback_immediately_outside_of_a_transaction() -> None:
    context = context_with()
    calls: list[str] = []
    context.after_commit(lambda: calls.append("callback"))
    assert calls == ["callback"]


async def test_still_defers_the_callback_without_a_unit_of_work_until_the_function_succeeds() -> None:
    context = context_with()
    order: list[str] = []

    async def work() -> Result[None]:
        context.after_commit(lambda: order.append("callback"))
        order.append("work")
        return OK

    await context.with_transaction(work)
    assert order == ["work", "callback"]
