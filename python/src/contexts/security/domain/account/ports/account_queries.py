"""Read model of an account: what a screen or an API may show. Never the credentials."""

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

from contexts.security.domain.account.account_status import AccountStatus
from shared_kernel.domain.role import Role


@dataclass(frozen=True)
class AccountDetail:
    id: str
    email: str
    role: Role
    status: AccountStatus
    last_authenticated_at: datetime | None = None


class AccountQueries(Protocol):
    async def find_by_id(self, id: str) -> AccountDetail | None: ...  # noqa: A002
