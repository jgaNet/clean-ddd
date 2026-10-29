"""EventBus: publishes events and routes them to the handlers subscribed to their name.

``publish()`` builds an Operation and schedules its ``dispatch()`` on the running loop, answering
with the operation at once: that is how a route answers ``202 { operationId }`` before the
handling is done (ADR 14), and what the Tracker context records so a client can poll it.
``dispatch()`` awaits the handlers; a test awaits the bus's ``settle()`` to see what they did.

Implementations: the in-memory bus of the building blocks' Infrastructure (a process-local
router) and the Tracker context's decorator that records every operation.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Protocol

from architecture.domain.event import Event

if TYPE_CHECKING:
    from architecture.application.execution_context import ExecutionContext
    from architecture.application.operation import Operation


class Subscriber(Protocol):
    """A handler as the bus sees it: it takes an operation and gives it back, marked."""

    async def handle(self, operation: Operation[Any]) -> Operation[Any]: ...


class EventBus(Protocol):
    async def connect(self) -> None:
        """Connects to the event infrastructure, when there is one."""
        ...

    def publish[E: Event](self, event: E, context: ExecutionContext, message_id: str | None = None) -> Operation[E]:
        """Builds the operation, schedules its dispatch, and answers with it before the handling.
        ``message_id`` is the message's id when the event is relayed from the outbox (its entry's
        id): a subscriber that already handled it is not handed it again (ADR 24). A fresh id
        otherwise."""
        ...

    async def dispatch(self, operation: Operation[Any]) -> Operation[Any]:
        """Hands the operation to every handler subscribed to its event's name, and awaits them."""
        ...

    async def subscribe(self, channel: str, handler: Subscriber) -> None:
        """Routes the events named ``channel`` to ``handler``."""
        ...
