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
        event, context = operation.event, operation.context
        name, channel = type(self).__name__, name_of(event)
        try:
            result = await self.execute(event, context)
        except Exception as error:
            if context.logger:
                context.logger.error(f"Unexpected error in {name} on {channel}", error, {"traceId": context.trace_id})
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
