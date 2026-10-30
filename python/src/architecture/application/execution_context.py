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
``with_transaction()``, ``before_commit()`` and ``after_commit()`` are what make "durable, then
published" possible: the events are appended to the unit of work's outbox at commit and relayed
after it (ADR 3, ADR 24).
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass
from typing import TYPE_CHECKING, Protocol

from architecture.application.outbox import Outbox, relay_outbox
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

    def has_active_transaction(self) -> bool:
        """Whether a transaction is open. The context owns its transaction: it asks this before
        opening one, and a transaction already open there is a programming error, not one to join."""
        ...

    @property
    def outbox(self) -> Outbox:
        """The transactional outbox: what this transaction makes durable to be published after it commits (ADR 24)."""
        ...

    def another(self) -> UnitOfWork:
        """A unit of work over the same stores and the same outbox, for a transaction of its own: the
        one a reaction runs in (ADR 30). With a database, another transaction from the same pool."""
        ...


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
    __slots__ = (
        "_after_commit",
        "_auth",
        "_before_commit",
        "_event_bus",
        "_in_transaction",
        "_logger",
        "_trace_id",
        "_unit_of_work",
    )

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
        self._before_commit: list[Callable[[], None]] = []
        self._after_commit: list[Callable[[], None]] = []

    async def with_transaction[T](self, fn: Callable[[], Awaitable[Result[T]]]) -> Result[T]:
        """Runs ``fn`` inside the unit of work when there is one: the ``before_commit`` steps
        registered during ``fn`` run inside the transaction once ``fn`` has succeeded (the outbox
        is written there), then the transaction commits, then the outbox is relayed through the
        bus, then the ``after_commit`` callbacks run. A failed result or a raise rolls back and
        drops every step and callback — whatever the failure, so a context is clean for its next
        transaction even after a unit of work that could not begin or roll back. Nested calls join
        the outer transaction: everything happens at the outermost one. The context owns that
        transaction: it opens it and closes it, and a unit of work that already has one open at the
        outermost call is a programming error (the steps and callbacks would otherwise run against
        a commit this context never sees), so it raises."""
        outermost = not self._in_transaction
        self._in_transaction = True
        try:
            result = await self._run_in_unit_of_work(fn, outermost)
            if outermost and isinstance(result, Success):
                callbacks, self._after_commit = self._after_commit, []
                self._relay()
                for callback in callbacks:
                    callback()
            return result
        finally:
            if outermost:
                self._in_transaction = False
                self._before_commit = []
                self._after_commit = []

    def before_commit(self, step: Callable[[], None]) -> None:
        """Runs ``step`` inside the current transaction, once the use case has succeeded and just
        before the commit: where ``publish_domain_events()`` appends the aggregate's events to the
        outbox, so that they are durable with the state they describe and gone with it on a
        rollback. Outside of any transaction (a handler's unit test calling ``execute()`` directly)
        there is nothing to wait for: the step runs immediately and the outbox is relayed at once."""
        if not self._in_transaction:
            step()
            self._relay()
            return
        self._before_commit.append(step)

    def after_commit(self, callback: Callable[[], None]) -> None:
        """Defers ``callback`` until the current transaction is committed, so that its side
        effects (typically publishing domain events) never leak facts that end up rolled back.
        Outside of any transaction the callback runs immediately."""
        if not self._in_transaction:
            callback()
            return
        self._after_commit.append(callback)

    def for_reaction(self) -> ExecutionContext:
        """The context a reaction to this request's facts runs in (ADR 30): the same caller, trace,
        bus and logger, and a unit of work of its own. A reaction's transaction is its own — not the
        one that published the fact, which has committed, nor the one of another reaction to the
        same fact, running beside it."""
        return ExecutionContext(
            trace_id=self._trace_id,
            auth=self._auth,
            event_bus=self._event_bus,
            unit_of_work=self._unit_of_work.another() if self._unit_of_work is not None else None,
            logger=self._logger,
        )

    def _relay(self) -> None:
        """Publishes what the unit of work's outbox holds, with this context (ADR 24)."""
        if self._unit_of_work is not None:
            relay_outbox(self._unit_of_work.outbox, self._event_bus, self)

    def _run_before_commit(self) -> None:
        """The ``before_commit`` steps, inside the transaction, once the outermost use case has succeeded."""
        steps, self._before_commit = self._before_commit, []
        for step in steps:
            step()

    async def _run_in_unit_of_work[T](self, fn: Callable[[], Awaitable[Result[T]]], outermost: bool) -> Result[T]:
        unit_of_work = self._unit_of_work
        if unit_of_work is None:
            result = await fn()
            if outermost and isinstance(result, Success):
                self._run_before_commit()
            return result

        if outermost:
            if unit_of_work.has_active_transaction():
                raise RuntimeError(
                    "The unit of work already has a transaction open: "
                    "the context owns its transaction and opens it itself, nothing else may begin one"
                )
            await unit_of_work.begin_transaction()

        try:
            result = await fn()
        except Exception as error:
            result = self._failed(error)
        if not outermost:
            return result

        if isinstance(result, Failure):
            await unit_of_work.rollback_transaction()
            return result
        try:
            self._run_before_commit()
            await unit_of_work.commit_transaction()
        except Exception as error:
            await unit_of_work.rollback_transaction()
            return self._failed(error)
        return result

    def _failed[T](self, error: Exception) -> Result[T]:
        """A raise inside the transaction, logged and turned into a failed Result (DOMAIN-RESULT)."""
        if self._logger:
            self._logger.error(
                "Transaction failed", error, {"traceId": self._trace_id, "userId": self._auth.subject_id}
            )
        return Failure(UnknownException(str(error) or type(error).__name__))

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
