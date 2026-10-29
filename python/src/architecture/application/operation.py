"""An Operation is what a published event becomes: a handle on its processing, with an id a
client can poll, the event, the caller's context, and the outcome once a handler has marked it.
The bus builds one in ``publish()`` and hands it to ``dispatch()``, so the id exists before the
handling starts and a transport can answer ``202 { operationId }`` at once (ADR 14)."""

from __future__ import annotations

from datetime import UTC, datetime
from enum import StrEnum
from typing import TYPE_CHECKING, Any
from uuid import uuid4

from architecture.domain.event import Event
from architecture.domain.exception import DomainException
from architecture.domain.result import Failure, Result, Success

if TYPE_CHECKING:
    from architecture.application.execution_context import ExecutionContext


class OperationStatus(StrEnum):
    PENDING = "PENDING"
    SUCCESS = "SUCCESS"
    SENT = "SENT"
    ERROR = "ERROR"


class Operation[E: Event]:
    __slots__ = ("context", "created_at", "event", "finished_at", "id", "result", "status")

    def __init__(self, event: E, context: ExecutionContext, id: str | None = None) -> None:
        # The id is the message's when the event is relayed from the outbox (ADR 24), fresh otherwise.
        self.id = id or str(uuid4())
        self.status = OperationStatus.PENDING
        self.event = event
        self.context = context
        self.created_at = datetime.now(UTC)
        self.finished_at: datetime | None = None
        self.result: Result[Any] | None = None

    def failed(self, error: DomainException) -> Operation[E]:
        """A command refused or a reaction that failed: the error is the operation's outcome."""
        self.status = OperationStatus.ERROR
        self.result = Failure(error)
        self.finished_at = datetime.now(UTC)
        return self

    def success(self, value: Any = None) -> Operation[E]:
        """A command that ran: its answer is the operation's result."""
        self.status = OperationStatus.SUCCESS
        self.result = Success(value)
        self.finished_at = datetime.now(UTC)
        return self

    def sent(self) -> Operation[E]:
        """A reaction that ran: an event handler answers nothing."""
        self.status = OperationStatus.SENT
        return self
