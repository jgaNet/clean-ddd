"""Who reaches a command is the transport's to say, at once (API-CALLER-AT-TRANSPORT, ADR 39):
``accept()`` publishes a signed-in caller's command and answers 202, refuses one who is not signed in
with 401 and publishes nothing, unless the command's handler says anyone may ask for it."""

import json
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

import pytest
from starlette.responses import JSONResponse

from architecture.application.command_handler import OK, CommandHandler
from architecture.application.execution_context import Auth, ExecutionContext
from architecture.application.module import Module, Subscription
from architecture.application.operation import Operation
from architecture.domain.common_exceptions import NotAllowedException, NotFoundException
from architecture.domain.event import CommandEvent, Event
from architecture.domain.result import Result
from architecture.presentation.http import AUTHENTICATION_REQUIRED, accept, not_allowed_status, status_of

AT = datetime(2026, 1, 1, tzinfo=UTC)


@dataclass(frozen=True)
class Post(CommandEvent):
    text: str


class PostHandler(CommandHandler[Post]):
    async def execute(self, command: Post, context: ExecutionContext) -> Result[Any]:
        return OK


@dataclass(frozen=True)
class Knock(CommandEvent):
    with_key: bool


class KnockHandler(CommandHandler[Knock]):
    """Anyone may knock with a key: the key is the proof; without one, only a signed-in caller."""

    def anyone_may_ask(self, command: Knock) -> bool:
        return command.with_key

    async def execute(self, command: Knock, context: ExecutionContext) -> Result[Any]:
        return OK


@dataclass(frozen=True)
class Stray(CommandEvent):
    pass


PROBE = Module(
    name="Probe",
    commands=[Subscription(Post, [PostHandler()]), Subscription(Knock, [KnockHandler()])],
)


class RecordingBus:
    def __init__(self) -> None:
        self.published: list[Event] = []

    async def connect(self) -> None: ...

    def publish[E: Event](self, event: E, context: ExecutionContext, message_id: str | None = None) -> Operation[E]:
        self.published.append(event)
        return Operation(event, context, clock=lambda: AT, id="operation-1")

    async def dispatch(self, operation: Operation[Any]) -> Operation[Any]:
        return operation

    async def subscribe(self, channel: str, handler: object) -> None: ...


@pytest.fixture
def bus() -> RecordingBus:
    return RecordingBus()


def context_from(bus: RecordingBus, subject_id: str | None = None) -> ExecutionContext:
    return ExecutionContext(
        trace_id="trace", event_bus=bus, auth=Auth(subject_id=subject_id, role="USER" if subject_id else None)
    )


def answered(response: JSONResponse) -> tuple[int, Any]:
    return response.status_code, json.loads(bytes(response.body))


def test_publishes_the_command_of_a_signed_in_caller_and_answers_202_with_the_operation(bus: RecordingBus) -> None:
    command = Post(text="hello")

    response = accept(PROBE, context_from(bus, "alice"), command)

    assert answered(response) == (202, {"operationId": "operation-1"})
    assert bus.published == [command]


def test_refuses_a_caller_who_is_not_signed_in_with_401_and_publishes_nothing(bus: RecordingBus) -> None:
    response = accept(PROBE, context_from(bus), Post(text="hello"))

    assert answered(response) == (401, {"message": AUTHENTICATION_REQUIRED})
    assert bus.published == []


def test_lets_anyone_ask_for_a_command_whose_handler_says_so_and_only_for_what_it_says(bus: RecordingBus) -> None:
    assert answered(accept(PROBE, context_from(bus), Knock(with_key=True)))[0] == 202
    assert answered(accept(PROBE, context_from(bus), Knock(with_key=False)))[0] == 401
    assert bus.published == [Knock(with_key=True)]


def test_treats_a_command_no_handler_of_the_module_answers_as_a_wiring_error(bus: RecordingBus) -> None:
    with pytest.raises(LookupError, match="No handler for Stray in module Probe"):
        accept(PROBE, context_from(bus), Stray())
    assert bus.published == []


def test_a_query_refuses_with_401_a_caller_who_is_not_signed_in_and_with_403_a_signed_in_one(
    bus: RecordingBus,
) -> None:
    anonymous, alice = context_from(bus), context_from(bus, "alice")
    assert (not_allowed_status(anonymous), not_allowed_status(alice)) == (401, 403)

    not_allowed = NotAllowedException("Probe", "Refused")
    assert (status_of(not_allowed, anonymous), status_of(not_allowed, alice)) == (401, 403)
    assert status_of(NotFoundException("Probe", "Missing"), anonymous) == 404
