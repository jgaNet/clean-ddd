"""QueryHandler is the base class of every read use case (the "Q" of CQRS).

A query never changes state. It asks a queries port (``Q``) for a read model (``R``) and returns
it. Because it does not go through aggregates, the read side can be shaped for the screen,
denormalized, cached or served from a different store than the write side (ADR 5).

It mirrors CommandHandler: ``handle()`` is what a controller calls, and does the guard, the
logging and the safety net once; a concrete handler only writes ``execute()``. There is no
transaction and no operation: a query answers synchronously and is never put on the bus.

Example: contexts/notes/application/queries/get_note.py
"""

from abc import ABC, abstractmethod
from typing import Any

from architecture.application.execution_context import ExecutionContext
from architecture.domain.common_exceptions import UnknownException
from architecture.domain.result import Failure, Result, Success

OK: Result[None] = Success(None)


class QueryHandler[Q, P, R](ABC):
    """``Q`` the queries port the handler reads from, ``P`` the query's parameters (``None`` when
    there are none), ``R`` the read model it answers with."""

    def __init__(self, queries: Q) -> None:
        self._queries = queries

    @property
    def queries(self) -> Q:
        return self._queries

    async def handle(self, payload: P, context: ExecutionContext) -> Result[R]:
        name = type(self).__name__
        if context.logger:
            context.logger.debug(f"Executing {name}", {"traceId": context.trace_id})

        guarded = await self.guard(payload, context)
        if isinstance(guarded, Failure):
            if context.logger:
                context.logger.warn(f"{name} refused: {guarded.error.message}", {"traceId": context.trace_id})
            return guarded

        try:
            result = await self.execute(payload, context)
        except Exception as error:
            if context.logger:
                context.logger.error(f"Unexpected error in {name}", error, {"traceId": context.trace_id})
            return Failure(UnknownException(str(error) or type(error).__name__))
        if isinstance(result, Failure) and context.logger:
            context.logger.warn(f"{name} failed: {result.error.message}", {"traceId": context.trace_id})
        return result

    async def guard(self, payload: P, context: ExecutionContext) -> Result[Any]:
        """Authorization hook. Override it to refuse callers who may not run this query.
        Which rows they may see is the query's own business, in ``execute()``."""
        return OK

    @abstractmethod
    async def execute(self, payload: P, context: ExecutionContext) -> Result[R]:
        """The read. Implement it in each concrete handler."""
