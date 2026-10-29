"""Decorates any EventBus so that every operation it carries is projected into the Tracker
records: when dispatched (PENDING) and again once handled (SUCCESS / ERROR / SENT). When a
command sent by an authenticated caller reaches its outcome, it also publishes
OperationCompleteIntegrationEvent, which the Notifications context turns into a live
notification: one notice per command, once there is something to say.

Tracking is a cross-cutting concern: the inner bus does not know it is being watched, and the
handlers do not know they are being recorded. The inner bus awaits the handlers, so the outcome
is known when ``dispatch()`` returns; the events a handler publishes meanwhile go through the
context's bus, which is this one, and are recorded on their own.
"""

import asyncio
from typing import Any

from architecture.application.event_bus import EventBus, Subscriber
from architecture.application.execution_context import ExecutionContext
from architecture.application.operation import Operation, OperationStatus
from architecture.domain.event import CommandEvent, Event, public_name_of
from architecture.domain.result import Failure, Success
from contexts.tracker.application.ports import OperationRecords
from contexts.tracker.application.projection import to_operation_record
from shared_kernel.application.integration_events.tracker_integration_events import (
    OperationCompleteIntegrationEvent,
)


class TrackedEventBus:
    def __init__(self, bus: EventBus, records: OperationRecords) -> None:
        self._bus = bus
        self._records = records
        self._pending: set[asyncio.Task[Operation[Any]]] = set()

    async def connect(self) -> None:
        await self._bus.connect()

    def publish[E: Event](self, event: E, context: ExecutionContext, message_id: str | None = None) -> Operation[E]:
        operation = Operation(event, context, id=message_id)
        task = asyncio.get_running_loop().create_task(self.dispatch(operation))
        self._pending.add(task)
        task.add_done_callback(self._pending.discard)
        return operation

    async def dispatch(self, operation: Operation[Any]) -> Operation[Any]:
        # The completion notice is about an operation; it is not one worth tracking itself.
        if isinstance(operation.event, OperationCompleteIntegrationEvent):
            return await self._bus.dispatch(operation)

        await self._records.save(to_operation_record(operation))
        done = await self._bus.dispatch(operation)
        await self._records.save(to_operation_record(done))

        # Only a command is something a client asked for and waits on, and only its outcome is
        # worth a notice (the client already holds the 202). Domain and integration events are
        # recorded for the trace but never announced: announcing them would notify about the
        # notification, which is itself an event, and so on without end.
        is_command = isinstance(done.event, CommandEvent)
        is_outcome = done.status in (OperationStatus.SUCCESS, OperationStatus.ERROR)
        user_id = done.context.auth.subject_id
        if is_command and is_outcome and user_id:
            self._notify_completion(done, user_id)
        return done

    async def subscribe(self, channel: str, handler: Subscriber) -> None:
        await self._bus.subscribe(channel, handler)

    async def settle(self) -> None:
        """Awaits every dispatch in flight, this bus's and the inner one's."""
        while self._pending:
            await asyncio.gather(*list(self._pending))
        inner_settle = getattr(self._bus, "settle", None)
        if inner_settle is not None:
            await inner_settle()

    def _notify_completion(self, operation: Operation[Any], user_id: str) -> None:
        result = operation.result
        self.publish(
            OperationCompleteIntegrationEvent(
                operation_id=operation.id,
                user_id=user_id,
                status=operation.status.value,
                type=public_name_of(operation.event),
                result=result.data if isinstance(result, Success) else None,
                error=result.error.message if isinstance(result, Failure) else None,
            ),
            operation.context,
        )
