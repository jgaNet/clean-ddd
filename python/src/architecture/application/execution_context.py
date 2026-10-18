"""ExecutionContext travels with one request through every handler it reaches: who is calling
(``auth``: a subject id and a role, as strings; which roles exist is the shared kernel's business,
not the mechanics'), how to correlate the logs (``trace_id``), and the services a use case may
need without owning them (``logger``, ``event_bus``, ``unit_of_work``). That is the whole list, on
purpose: each member exists per request. Anything a handler needs that does not (a mailer, a
clock, a model client) is a constructor dependency, so that the handler's needs stay in its
signature and the context does not become a service locator (ARCH-EXECUTION-CONTEXT).

The bootstrap builds one per HTTP request; tests build one by hand::

    ExecutionContext(trace_id="trace", event_bus=bus, auth=Auth(subject_id="alice", role="USER"))

A handler reads ``context.auth`` to know the caller and passes ``context`` on when it publishes.
``with_transaction()`` and ``after_commit()`` are what make "publish after commit" possible
(ADR 3).
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass
from typing import TYPE_CHECKING, Protocol

from architecture.domain.common_exceptions import UnknownException
from architecture.domain.result import Failure, Result, Success

if TYPE_CHECKING:
    from architecture.application.event_bus import EventBus

#: What a log line carries besides its message; ``traceId`` is read by the console logger.
Meta = Mapping[str, object]


class UnitOfWork(Protocol):
    """The transaction boundary: a database's four verbs, or the in-memory stores' snapshot."""

    async def begin_transaction(self) -> None: ...

    async def commit_transaction(self) -> None: ...

    async def rollback_transaction(self) -> None: ...

    def has_active_transaction(self) -> bool: ...


class Logger(Protocol):
    def info(self, message: str, meta: Meta | None = None) -> None: ...

    def warn(self, message: str, meta: Meta | None = None) -> None: ...

    def error(self, message: str, error: object = None, meta: Meta | None = None) -> None: ...

    def debug(self, message: str, meta: Meta | None = None) -> None: ...


@dataclass(frozen=True)
class Auth:
    """Who is calling: the subject's id and role, both absent for an anonymous request."""

    subject_id: str | None = None
    role: str | None = None


class ExecutionContext:
    __slots__ = ("_after_commit", "_auth", "_event_bus", "_in_transaction", "_logger", "_trace_id", "_unit_of_work")

    def __init__(
        self,
        *,
        trace_id: str,
        event_bus: EventBus,
        auth: Auth | None = None,
        unit_of_work: UnitOfWork | None = None,
        logger: Logger | None = None,
    ) -> None:
        self._trace_id = trace_id
        self._auth = auth or Auth()
        self._event_bus = event_bus
        self._unit_of_work = unit_of_work
        self._logger = logger
        self._in_transaction = False
        self._after_commit: list[Callable[[], None]] = []

    async def with_transaction[T](self, fn: Callable[[], Awaitable[Result[T]]]) -> Result[T]:
        """Runs ``fn`` inside the unit of work when there is one, then runs the ``after_commit``
        callbacks registered during ``fn`` once the transaction is committed. A failed result or
        a raise rolls back and drops those callbacks. Nested calls join the outer transaction."""
        outermost = not self._in_transaction
        self._in_transaction = True
        try:
            result = await self._run_in_unit_of_work(fn)
            if outermost:
                callbacks, self._after_commit = self._after_commit, []
                if isinstance(result, Success):
                    for callback in callbacks:
                        callback()
            return result
        finally:
            if outermost:
                self._in_transaction = False

    def after_commit(self, callback: Callable[[], None]) -> None:
        """Defers ``callback`` until the current transaction is committed, so that its side
        effects (typically publishing domain events) never leak facts that end up rolled back.
        Outside of any transaction the callback runs immediately."""
        if not self._in_transaction:
            callback()
            return
        self._after_commit.append(callback)

    async def _run_in_unit_of_work[T](self, fn: Callable[[], Awaitable[Result[T]]]) -> Result[T]:
        unit_of_work = self._unit_of_work
        joined = unit_of_work is None or unit_of_work.has_active_transaction()
        if unit_of_work is not None and not joined:
            await unit_of_work.begin_transaction()
        try:
            result = await fn()
        except Exception as error:
            if unit_of_work is not None and not joined:
                await unit_of_work.rollback_transaction()
            if self._logger:
                # The Logger port, not the standard library's: the lint mistakes its signature for a format string.
                self._logger.error(  # noqa: PLE1205
                    "Transaction failed", error, {"traceId": self._trace_id, "userId": self._auth.subject_id}
                )
            return Failure(UnknownException(str(error) or type(error).__name__))
        if unit_of_work is not None and not joined:
            if isinstance(result, Failure):
                await unit_of_work.rollback_transaction()
            else:
                await unit_of_work.commit_transaction()
        return result

    @property
    def trace_id(self) -> str:
        return self._trace_id

    @property
    def auth(self) -> Auth:
        return self._auth

    @property
    def event_bus(self) -> EventBus:
        return self._event_bus

    @property
    def unit_of_work(self) -> UnitOfWork | None:
        return self._unit_of_work

    @property
    def logger(self) -> Logger | None:
        return self._logger
