"""EventHandler: reacts to an event. It is the base of every listener in the application layer,
and the parent of CommandHandler.

A domain event handler stays inside its context and typically logs, updates a read model or
publishes an integration event for other contexts (contexts/notes/application/events). An
integration event handler lives in the receiving context and translates the foreign event into
a local command or service call.

A reaction is awaited and its outcome recorded on the operation (SENT, or ERROR with the
failure), so a listener that fails is visible in the trace instead of vanishing. It cannot undo
the fact it reacted to: the event was published after the commit (ADR 3), and a failed reaction
is the listener's problem to retry or report, never the publisher's.

A reaction runs in a transaction of its own (ADR 30), opened here, in a context of its own
(``context.for_reaction()``): what it saves, and the facts it records or publishes, commit
together or not at all, and go out through the outbox after the commit, like a command's. So
``execute()`` saves, calls ``publish_domain_events()`` for an aggregate it changed and
``publish_integration_event()`` for a fact it tells other contexts, and returns a failed Result
to undo all of it. It is not made idempotent by hand: all or nothing, one id per fact, and the
bus's inbox hand a fact to a reaction once.
"""

from abc import ABC, abstractmethod
from typing import Any

from architecture.application.execution_context import ExecutionContext
from architecture.application.operation import Operation
from architecture.domain.common_exceptions import UnknownException
from architecture.domain.event import Event, name_of
from architecture.domain.result import Failure, Result


class EventHandler[E: Event](ABC):
    async def handle(self, operation: Operation[E]) -> Operation[E]:
        event, context = operation.event, operation.context.for_reaction()
        name, channel = type(self).__name__, name_of(event)

        async def react() -> Result[Any]:
            try:
                return await self.execute(event, context)
            except Exception as error:
                if context.logger:
                    meta = {"traceId": context.trace_id}
                    context.logger.error(f"Unexpected error in {name} on {channel}", error, meta)
                return Failure(UnknownException(str(error) or type(error).__name__))

        try:
            result = await context.with_transaction(react)
        except Exception as error:
            if context.logger:
                context.logger.error(f"{name} could not run on {channel}", error, {"traceId": context.trace_id})
            return operation.failed(UnknownException(str(error) or type(error).__name__))
        if isinstance(result, Failure):
            if context.logger:
                context.logger.warn(
                    f"{name} failed on {channel}: {result.error.message}", {"traceId": context.trace_id}
                )
            return operation.failed(result.error)
        return operation.sent()

    @abstractmethod
    async def execute(self, event: E, context: ExecutionContext) -> Result[Any]:
        """The reaction. Implement it in each concrete handler."""
