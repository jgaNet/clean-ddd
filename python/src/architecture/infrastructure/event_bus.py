"""A process-local bus: a dict of handlers by event name. ``publish()`` builds the operation and
schedules its dispatch as a task on the running loop, answering with the operation at once, so
a route can answer ``202 { operationId }`` before the handling is done (ADR 14); the handler
fills the operation's status and result in, and the Tracker context records those by decorating
this bus. ``settle()`` awaits every dispatch still running: a test calls it to see what the
handlers did, the bootstrap calls it before stopping.
"""

import asyncio
from typing import Any

from architecture.application.event_bus import Subscriber
from architecture.application.execution_context import ExecutionContext
from architecture.application.operation import Operation
from architecture.domain.event import Event, name_of


class InMemoryEventBus:
    def __init__(self) -> None:
        self._handlers: dict[str, list[Subscriber]] = {}
        self._pending: set[asyncio.Task[Operation[Any]]] = set()

    async def connect(self) -> None:
        """Nothing to connect to: the handlers are in this process."""

    def publish[E: Event](self, event: E, context: ExecutionContext) -> Operation[E]:
        operation = Operation(event, context)
        task = asyncio.get_running_loop().create_task(self.dispatch(operation))
        self._pending.add(task)
        task.add_done_callback(self._pending.discard)
        return operation

    async def dispatch(self, operation: Operation[Any]) -> Operation[Any]:
        # The channel is the event's name: what arrives on it is that event, which the dict cannot know.
        for handler in list(self._handlers.get(name_of(operation.event), [])):
            await handler.handle(operation)
        return operation

    async def subscribe(self, channel: str, handler: Subscriber) -> None:
        self._handlers.setdefault(channel, []).append(handler)

    async def settle(self) -> None:
        """Awaits every dispatch in flight, including the ones those dispatches publish."""
        while self._pending:
            await asyncio.gather(*list(self._pending))
