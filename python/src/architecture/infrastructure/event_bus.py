"""A process-local bus: a dict of handlers by event name. ``publish()`` builds the operation and
schedules its dispatch as a task on the running loop, answering with the operation at once, so
a route can answer ``202 { operationId }`` before the handling is done (ADR 14); the handler
fills the operation's status and result in, and the Tracker context records those by decorating
this bus. ``settle()`` awaits every dispatch still running: a test calls it to see what the
handlers did, the bootstrap calls it before stopping.

Delivery is idempotent per subscriber (ADR 24): a message relayed from the outbox carries its
entry's id, and a subscriber that already handled that id — and did not fail — is not handed it
again. The inbox is the bus's, not each handler's, so a reaction stays a plain ``execute()``; a
reaction that failed is handed the message again, which is what at-least-once is for. The
handlers are awaited one after the other, so the status a subscriber's ``handle()`` leaves on the
operation is that subscriber's own outcome when its inbox is decided, whoever runs next.

An operation's ``delivered`` settles once the dispatch has been through every subscriber, and says
whether all of them succeeded: the outbox's relay acknowledges an entry on it, and on nothing
sooner. A dispatch that breaks off settles it as not delivered.
"""

import asyncio
from typing import Any

from architecture.application.event_bus import Subscriber
from architecture.application.execution_context import ExecutionContext
from architecture.application.operation import Operation, OperationStatus
from architecture.domain.event import Event, name_of


class _Subscription:
    """A handler on a channel, and the inbox: the ids of the messages it handled."""

    __slots__ = ("handler", "inbox")

    def __init__(self, handler: Subscriber) -> None:
        self.handler = handler
        self.inbox: set[str] = set()


class InMemoryEventBus:
    def __init__(self) -> None:
        self._subscriptions: dict[str, list[_Subscription]] = {}
        self._pending: set[asyncio.Task[Operation[Any]]] = set()

    async def connect(self) -> None:
        """Nothing to connect to: the handlers are in this process."""

    def publish[E: Event](self, event: E, context: ExecutionContext, message_id: str | None = None) -> Operation[E]:
        loop = asyncio.get_running_loop()
        operation = Operation(event, context, id=message_id)
        operation.delivered = loop.create_future()
        task = loop.create_task(self.dispatch(operation))
        self._pending.add(task)
        task.add_done_callback(self._pending.discard)
        # A dispatch that ended without a verdict (it raised) has not delivered to every subscriber.
        task.add_done_callback(lambda _: operation.settle_delivery(False))
        return operation

    async def dispatch(self, operation: Operation[Any]) -> Operation[Any]:
        every_one = True
        # The channel is the event's name: what arrives on it is that event, which the dict cannot know.
        for subscription in list(self._subscriptions.get(name_of(operation.event), [])):
            if operation.id in subscription.inbox:
                operation.sent()
                continue
            done = await subscription.handler.handle(operation)
            if done.status is not OperationStatus.ERROR:
                subscription.inbox.add(operation.id)
            else:
                every_one = False
        operation.settle_delivery(every_one)
        return operation

    async def subscribe(self, channel: str, handler: Subscriber) -> None:
        self._subscriptions.setdefault(channel, []).append(_Subscription(handler))

    async def settle(self) -> None:
        """Awaits every dispatch in flight, including the ones those dispatches publish."""
        while self._pending:
            await asyncio.gather(*list(self._pending))
