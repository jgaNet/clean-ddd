from typing import Any

from architecture.application.execution_context import Auth, ExecutionContext
from architecture.application.operation import Operation
from architecture.domain.event import Event
from architecture.domain.id import Id
from architecture.domain.result import Failure, Success
from shared_kernel.application.guards import require_signed_in


class NoBus:
    async def connect(self) -> None: ...

    def publish[E: Event](self, event: E, context: ExecutionContext) -> Operation[E]:
        raise AssertionError("not used")

    async def dispatch(self, operation: Operation[Any]) -> Operation[Any]:
        return operation

    async def subscribe(self, channel: str, handler: object) -> None: ...


def context_for(subject_id: str | None, role: str | None) -> ExecutionContext:
    return ExecutionContext(trace_id="trace", event_bus=NoBus(), auth=Auth(subject_id=subject_id, role=role))


def test_answers_the_id_of_a_signed_in_user_or_administrator() -> None:
    assert require_signed_in(context_for("alice", "USER"), "Notes") == Success(Id("alice"))
    assert require_signed_in(context_for("root", "ADMIN"), "Notes") == Success(Id("root"))


def test_refuses_a_guest_an_unknown_role_and_an_anonymous_caller_naming_the_service() -> None:
    for context in (context_for("alice", "GUEST"), context_for("alice", "boss"), context_for(None, "USER")):
        refused = require_signed_in(context, "Notes")
        assert isinstance(refused, Failure)
        assert refused.error.type == "NotAllowed" and refused.error.service == "Notes"
