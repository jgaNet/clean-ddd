from dataclasses import dataclass
from typing import Any

from architecture.application.execution_context import Auth, ExecutionContext
from architecture.application.operation import Operation, OperationStatus
from architecture.domain.common_exceptions import NotFoundException
from architecture.domain.event import CommandEvent, Event
from contexts.tracker.application.projection import to_operation_record
from contexts.tracker.application.read_model import OperationError


@dataclass(frozen=True)
class DoSomething(CommandEvent):
    what: str


class NoBus:
    async def connect(self) -> None: ...

    def publish[E: Event](self, event: E, context: ExecutionContext) -> Operation[E]:
        raise AssertionError("not used")

    async def dispatch(self, operation: Operation[Any]) -> Operation[Any]:
        return operation

    async def subscribe(self, channel: str, handler: object) -> None: ...


def an_operation(subject_id: str | None = None) -> Operation[DoSomething]:
    context = ExecutionContext(trace_id="trace-1", event_bus=NoBus(), auth=Auth(subject_id=subject_id, role="USER"))
    return Operation(DoSomething(what="this"), context)


def test_keeps_what_a_client_needs_and_drops_the_execution_context() -> None:
    operation = an_operation("alice")
    record = to_operation_record(operation)

    assert (record.id, record.name, record.status) == (operation.id, "DoSomething", OperationStatus.PENDING)
    assert (record.trace_id, record.subject_id) == ("trace-1", "alice")
    assert (record.result, record.error, record.finished_at) == (None, None, None)
    assert record.created_at == operation.created_at
    assert not hasattr(record, "context")


def test_flattens_a_success_into_result() -> None:
    record = to_operation_record(an_operation("alice").success("note-42"))
    assert (record.status, record.result, record.error) == (OperationStatus.SUCCESS, "note-42", None)


def test_flattens_a_failure_into_error_in_words_a_client_can_show() -> None:
    record = to_operation_record(an_operation("alice").failed(NotFoundException("Notes", "Note not found")))
    assert (record.status, record.result) == (OperationStatus.ERROR, None)
    assert record.error == OperationError(type="NotFound", message="Note not found")


def test_leaves_subject_id_out_for_an_anonymous_caller() -> None:
    assert to_operation_record(an_operation()).subject_id is None
