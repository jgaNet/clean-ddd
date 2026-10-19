"""A user may read their own account; an administrator may read any."""

from typing import Any

from architecture.application.execution_context import ExecutionContext
from architecture.application.query_handler import OK, QueryHandler
from architecture.domain.common_exceptions import NotAllowedException, NotFoundException
from architecture.domain.result import Failure, Result, Success
from contexts.security.domain.account.account_exceptions import SERVICE
from contexts.security.domain.account.ports.account_queries import AccountDetail, AccountQueries
from shared_kernel.domain.role import Role


class GetAccountQueryHandler(QueryHandler[AccountQueries, str, AccountDetail]):
    async def guard(self, account_id: str, context: ExecutionContext) -> Result[Any]:
        role = Role.parse(context.auth.role)
        if role is None or role is Role.GUEST:
            return Failure(NotAllowedException(SERVICE, "Authentication required"))
        if role is Role.USER and context.auth.subject_id != account_id:
            return Failure(NotAllowedException(SERVICE, "Not Allowed"))
        return OK

    async def execute(self, account_id: str, context: ExecutionContext) -> Result[AccountDetail]:
        account = await self.queries.find_by_id(account_id)
        if account is None:
            return Failure(NotFoundException(SERVICE, "Account not found"))
        return Success(account)
