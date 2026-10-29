"""A user may follow their own operations; an administrator may follow any. An operation nobody
started — an anonymous command, a sign-up — is followed by whoever holds its id: the id is
unguessable and is only ever given to the caller who started it, in the 202 (ADR 27)."""

from architecture.application.execution_context import ExecutionContext
from architecture.application.query_handler import QueryHandler
from architecture.domain.common_exceptions import NotFoundException
from architecture.domain.result import Failure, Result, Success
from contexts.tracker.application.ports import OperationRecords
from contexts.tracker.application.read_model import OperationRecord
from shared_kernel.application.guards import require_signed_in
from shared_kernel.domain.role import Role

SERVICE = "Tracker"


class GetOperationQueryHandler(QueryHandler[OperationRecords, str, OperationRecord]):
    async def execute(self, operation_id: str, context: ExecutionContext) -> Result[OperationRecord]:
        record = await self.queries.find_by_id(operation_id)
        if record is not None and not record.subject_id:
            return Success(record)

        reader = require_signed_in(context, SERVICE)
        if isinstance(reader, Failure):
            return reader

        # An operation someone else started does not exist, as far as you know.
        is_admin = Role.parse(context.auth.role) is Role.ADMIN
        if record is None or not (is_admin or record.subject_id == reader.data.value):
            return Failure(NotFoundException(SERVICE, "Operation not found", {"id": operation_id}))
        return Success(record)
