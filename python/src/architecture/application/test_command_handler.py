"""The shape of every concrete handler, and what the base class does around it: a guard for who
may call, an execute for the use case, a transaction around it, the events after the commit,
and the use case again from a fresh read when it lost a race (ADR 25)."""

from dataclasses import dataclass
from typing import Any

from architecture.application.command_handler import CommandHandler
from architecture.application.execution_context import Auth, ExecutionContext
from architecture.application.operation import Operation, OperationStatus
from architecture.domain.aggregate_root import AggregateRoot
from architecture.domain.common_exceptions import ConcurrencyConflictException, NotAllowedException
from architecture.domain.event import CommandEvent, DomainEvent, Event
from architecture.domain.id import Id
from architecture.domain.result import Failure, Result, Success
from architecture.infrastructure.outbox import InMemoryOutbox


@dataclass(frozen=True)
class Greet(CommandEvent):
    name: str
    then: str = ""
    conflicts: int = 0


@dataclass(frozen=True)
class Greeted(DomainEvent):
    name: str


class Greeter(AggregateRoot):
    def greet(self, name: str) -> None:
        self._record(Greeted(name=name))


class GreetHandler(CommandHandler[Greet]):
    def __init__(self) -> None:
        #: How many times ``execute()`` ran: a conflict re-runs it from a fresh read (ADR 25).
        self.executions = 0

    async def guard(self, command: Greet, context: ExecutionContext) -> Result[Any]:
        if context.auth.role == "guest":
            return Failure(NotAllowedException("Test", "Guests cannot greet"))
        return Success(None)

    async def execute(self, command: Greet, context: ExecutionContext) -> Result[str]:
        self.executions += 1
        if command.then == "throw":
            raise RuntimeError("boom")
        if command.then == "fail":
            return Failure(NotAllowedException("Test", "Refused"))
        if self.executions <= command.conflicts:
            return Failure(ConcurrencyConflictException("Test", "The greeter changed since it was read"))
        greeter = Greeter(Id("greeter"))
        greeter.greet(command.name)
        self.publish_domain_events(greeter, context)
        return Success(f"Hello {command.name}")


class RecordingUnitOfWork:
    """Records the order of things, so the tests can see what happened before what."""

    def __init__(self) -> None:
        self.log: list[str] = []
        self.outbox = InMemoryOutbox()
        self._active = False

    async def begin_transaction(self) -> None:
        self._active = True
        self.log.append("begin")

    async def commit_transaction(self) -> None:
        self._active = False
        self.log.append("commit")

    async def rollback_transaction(self) -> None:
        self._active = False
        self.log.append("rollback")

    def has_active_transaction(self) -> bool:
        return self._active


class RecordingBus:
    def __init__(self, log: list[str]) -> None:
        self.log = log
        self.published: list[Event] = []
        self.message_ids: list[str | None] = []

    async def connect(self) -> None: ...

    def publish[E: Event](self, event: E, context: ExecutionContext, message_id: str | None = None) -> Operation[E]:
        self.log.append("publish")
        self.published.append(event)
        self.message_ids.append(message_id)
        return Operation(event, context, id=message_id)

    async def dispatch(self, operation: Operation[Any]) -> Operation[Any]:
        return operation

    async def subscribe(self, channel: str, handler: object) -> None: ...


def operation_for(command: Greet, role: str = "user") -> tuple[Operation[Greet], RecordingUnitOfWork, RecordingBus]:
    unit_of_work = RecordingUnitOfWork()
    bus = RecordingBus(unit_of_work.log)
    context = ExecutionContext(
        trace_id="trace", event_bus=bus, unit_of_work=unit_of_work, auth=Auth(subject_id="alice", role=role)
    )
    return Operation(command, context), unit_of_work, bus


async def test_runs_the_use_case_inside_a_transaction_and_publishes_the_domain_events_after_the_commit() -> None:
    operation, unit_of_work, bus = operation_for(Greet(name="Alice"))

    done = await GreetHandler().handle(operation)

    assert done.status is OperationStatus.SUCCESS
    assert isinstance(done.result, Success) and done.result.data == "Hello Alice"
    assert unit_of_work.log == ["begin", "commit", "publish"]
    assert bus.published == [Greeted(name="Alice")]
    assert bus.message_ids and isinstance(bus.message_ids[0], str)
    assert unit_of_work.outbox.pending() == []


async def test_runs_the_use_case_again_from_a_fresh_read_when_it_lost_a_race_and_answers_with_the_second_run() -> None:
    operation, unit_of_work, _ = operation_for(Greet(name="Alice", conflicts=1))
    handler = GreetHandler()

    done = await handler.handle(operation)

    assert done.status is OperationStatus.SUCCESS
    assert handler.executions == 2
    # The first attempt rolled back and published nothing; the second committed and published.
    assert unit_of_work.log == ["begin", "rollback", "begin", "commit", "publish"]


async def test_refuses_with_the_conflict_after_the_third_attempt_and_publishes_nothing() -> None:
    operation, unit_of_work, bus = operation_for(Greet(name="Alice", conflicts=10))
    handler = GreetHandler()

    done = await handler.handle(operation)

    assert done.status is OperationStatus.ERROR
    assert isinstance(done.result, Failure) and done.result.error.type == "ConcurrencyConflict"
    assert handler.executions == CommandHandler.CONFLICT_ATTEMPTS
    assert unit_of_work.log == ["begin", "rollback", "begin", "rollback", "begin", "rollback"]
    assert bus.published == []


async def test_refuses_at_the_guard_without_opening_a_transaction_or_running_the_use_case() -> None:
    operation, unit_of_work, _ = operation_for(Greet(name="Alice"), role="guest")

    done = await GreetHandler().handle(operation)

    assert done.status is OperationStatus.ERROR
    assert isinstance(done.result, Failure) and done.result.error.type == "NotAllowed"
    assert unit_of_work.log == []


async def test_rolls_back_a_failed_result_and_publishes_nothing() -> None:
    operation, unit_of_work, bus = operation_for(Greet(name="Alice", then="fail"))

    done = await GreetHandler().handle(operation)

    assert done.status is OperationStatus.ERROR
    assert unit_of_work.log == ["begin", "rollback"]
    assert bus.published == []


async def test_turns_a_raise_into_a_failed_operation_instead_of_crashing_and_rolls_back() -> None:
    operation, unit_of_work, bus = operation_for(Greet(name="Alice", then="throw"))

    done = await GreetHandler().handle(operation)

    assert done.status is OperationStatus.ERROR
    assert isinstance(done.result, Failure) and done.result.error.message == "boom"
    assert unit_of_work.log == ["begin", "rollback"]
    assert bus.published == []
