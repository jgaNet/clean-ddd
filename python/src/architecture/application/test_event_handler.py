from dataclasses import dataclass
from typing import Any

from architecture.application.event_handler import EventHandler
from architecture.application.execution_context import ExecutionContext
from architecture.application.operation import Operation, OperationStatus
from architecture.domain.common_exceptions import NotFoundException
from architecture.domain.event import DomainEvent, Event
from architecture.domain.result import Failure, Result, Success


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
