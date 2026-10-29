"""Who may follow an operation: whoever holds the id of one nobody started; the account that
started one, and an administrator; an anonymous caller is asked to sign in for anything else,
and another account is told it does not exist."""

from datetime import UTC, datetime

from architecture.application.execution_context import Auth, ExecutionContext
from architecture.application.operation import OperationStatus
from architecture.domain.common_exceptions import NotAllowedException, NotFoundException
from architecture.domain.result import Failure, Success
from architecture.infrastructure.data_sources import InMemoryDataSource
from architecture.infrastructure.event_bus import InMemoryEventBus
from contexts.tracker.application.queries.get_operation import GetOperationQueryHandler
from contexts.tracker.application.read_model import OperationRecord
from contexts.tracker.infrastructure.records import InMemoryOperationRecords
from shared_kernel.domain.role import Role


def as_(role: Role, subject_id: str | None = None) -> ExecutionContext:
    return ExecutionContext(trace_id="trace", event_bus=InMemoryEventBus(), auth=Auth(subject_id, role.value))


ANONYMOUS = as_(Role.GUEST)


def record(id: str, subject_id: str | None) -> OperationRecord:
    return OperationRecord(
        id=id,
        name="DoSomething",
        status=OperationStatus.SUCCESS,
        trace_id="trace",
        created_at=datetime(2026, 1, 1, 10, tzinfo=UTC),
        subject_id=subject_id,
    )


async def a_handler() -> GetOperationQueryHandler:
    records = InMemoryOperationRecords(InMemoryDataSource())
    await records.save(record("nobody", None))
    await records.save(record("alice", "alice"))
    return GetOperationQueryHandler(records)


async def test_shows_an_operation_nobody_started_to_whoever_holds_its_id_signed_in_or_not() -> None:
    handler = await a_handler()
    for context in (ANONYMOUS, as_(Role.USER, "bob")):
        result = await handler.execute("nobody", context)
        assert isinstance(result, Success)
        assert result.data.id == "nobody"


async def test_shows_an_operation_an_account_started_to_that_account_and_to_an_administrator() -> None:
    handler = await a_handler()
    for context in (as_(Role.USER, "alice"), as_(Role.ADMIN, "root")):
        result = await handler.execute("alice", context)
        assert isinstance(result, Success)
        assert result.data.id == "alice"


async def test_asks_an_anonymous_caller_to_sign_in_for_anything_else_known_or_not() -> None:
    handler = await a_handler()
    for id in ("alice", "unknown"):
        result = await handler.execute(id, ANONYMOUS)
        assert isinstance(result, Failure)
        assert isinstance(result.error, NotAllowedException)


async def test_tells_another_account_that_an_operation_it_did_not_start_does_not_exist() -> None:
    handler = await a_handler()
    for id in ("alice", "unknown"):
        result = await handler.execute(id, as_(Role.USER, "bob"))
        assert isinstance(result, Failure)
        assert isinstance(result.error, NotFoundException)
