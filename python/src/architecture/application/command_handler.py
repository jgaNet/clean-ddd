"""CommandHandler is the base class of every use case that changes state (the "C" of CQRS).

A concrete handler only writes ``execute()``: load an aggregate, call a behaviour on it, save
it, publish its events. Everything else that every command needs is done once, here:

1. ``guard()``   authorization: may this caller run this command at all?
2. logging       what ran, and whether it failed
3. transaction   ``execute()`` runs inside the context's unit of work when there is one
4. safety net    an unexpected raise becomes a failed Result instead of a crash
5. retry         a concurrency conflict is re-read and re-decided in a new transaction, up to
                 ``CONFLICT_ATTEMPTS`` times; the last conflict is the refusal (ADR 25)

The handler is subscribed to its command on the event bus by the Module, so ``handle()``
receives an Operation (the command plus its execution context) and marks it done. ``run()`` is
the typed half of the same template method, for the rare command a caller runs synchronously
instead of publishing (a login, whose token must not travel through the bus).

Example: contexts/notes/application/commands/edit_note.py
"""

from abc import abstractmethod
from typing import Any, ClassVar

from architecture.application.domain_events import publish_domain_events
from architecture.application.event_handler import EventHandler
from architecture.application.execution_context import ExecutionContext
from architecture.application.operation import Operation
from architecture.domain.aggregate_root import AggregateRoot
from architecture.domain.common_exceptions import ConcurrencyConflictException, UnknownException
from architecture.domain.event import CommandEvent, name_of
from architecture.domain.result import Failure, Result, Success

OK: Result[None] = Success(None)


class CommandHandler[C: CommandEvent](EventHandler[C]):
    #: How many times ``execute()`` runs on a concurrency conflict before the conflict is the answer.
    CONFLICT_ATTEMPTS: ClassVar[int] = 3

    async def handle(self, operation: Operation[C]) -> Operation[C]:
        result = await self.run(operation.event, operation.context)
        if isinstance(result, Failure):
            return operation.failed(result.error)
        return operation.success(result.data)

    async def run(self, command: C, context: ExecutionContext) -> Result[Any]:
        """Guard, log, transaction, safety net; the use case's answer in return."""
        name = name_of(command)
        guarded = await self.guard(command, context)
        if isinstance(guarded, Failure):
            if context.logger:
                context.logger.warn(f"{name} refused: {guarded.error.message}", {"traceId": context.trace_id})
            return guarded

        if context.logger:
            context.logger.info(f"Executing {name}", {"traceId": context.trace_id})

        result = await self._execute_until_uncontended(command, context)
        if isinstance(result, Failure) and context.logger:
            context.logger.warn(f"{name} failed: {result.error.message}", {"traceId": context.trace_id})
        return result

    async def guard(self, command: C, context: ExecutionContext) -> Result[Any]:
        """Authorization hook. Override it to refuse callers who may not run this command.
        Business rules about *what* they may do to *which* object belong in the aggregate."""
        return OK

    @abstractmethod
    async def execute(self, command: C, context: ExecutionContext) -> Result[Any]:
        """The use case. Implement it in each concrete handler."""

    def publish_domain_events(self, aggregate: AggregateRoot, context: ExecutionContext) -> None:
        """Makes every domain event the aggregate recorded during ``execute()`` durable with the
        transaction, and lets the context publish it once committed, so listeners never see
        facts that end up rolled back, and never miss one that was."""
        publish_domain_events(aggregate, context)

    async def _execute_until_uncontended(self, command: C, context: ExecutionContext) -> Result[Any]:
        """The use case in its transaction; again, from a fresh read, when the first run lost a
        race (ADR 25). ``execute()`` loads the aggregate, so the second run re-decides the rule
        on what the other writer left; nothing is re-applied blindly. A failed attempt rolled
        back and dropped its events, like any failed Result."""
        attempts = self.CONFLICT_ATTEMPTS
        attempt = 1
        while True:
            result = await context.with_transaction(lambda: self._safe_execute(command, context))
            conflict = isinstance(result, Failure) and isinstance(result.error, ConcurrencyConflictException)
            if not conflict or attempt >= attempts:
                return result
            if context.logger:
                context.logger.info(
                    f"{name_of(command)} lost a race (attempt {attempt} of {attempts}); reading again",
                    {"traceId": context.trace_id},
                )
            attempt += 1

    async def _safe_execute(self, command: C, context: ExecutionContext) -> Result[Any]:
        try:
            return await self.execute(command, context)
        except Exception as error:
            if context.logger:
                context.logger.error(f"Unexpected error in {name_of(command)}", error, {"traceId": context.trace_id})
            return Failure(UnknownException(str(error) or type(error).__name__))
