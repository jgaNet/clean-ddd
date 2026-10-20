"""Listing every operation is an administrator's view."""

from dataclasses import dataclass
from typing import Any

from architecture.application.execution_context import ExecutionContext
from architecture.application.query_handler import OK, QueryHandler
from architecture.domain.common_exceptions import NotAllowedException
from architecture.domain.result import Failure, Result, Success
from contexts.tracker.application.ports import OperationRecords
from contexts.tracker.application.read_model import OperationRecord
from shared_kernel.domain.role import Role

SERVICE = "Tracker"


@dataclass(frozen=True)
class OperationFilters:
    trace_id: str | None = None


class GetOperationsQueryHandler(QueryHandler[OperationRecords, OperationFilters, list[OperationRecord]]):
    async def guard(self, filters: OperationFilters, context: ExecutionContext) -> Result[Any]:
        if Role.parse(context.auth.role) is not Role.ADMIN:
            return Failure(NotAllowedException(SERVICE, "Only an administrator can list operations"))
        return OK

    async def execute(self, filters: OperationFilters, context: ExecutionContext) -> Result[list[OperationRecord]]:
        if filters.trace_id:
            return Success(await self.queries.find_by_trace_id(filters.trace_id))
        return Success(await self.queries.find_all())
