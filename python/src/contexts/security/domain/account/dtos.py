"""Snapshot of an Account: the plain data the aggregate is persisted as and rebuilt from. It is
the only shape that crosses the domain boundary towards the infrastructure."""

from dataclasses import dataclass
from datetime import datetime

from contexts.security.domain.account.account_status import AccountStatus
from shared_kernel.domain.role import Role


@dataclass(frozen=True)
class CredentialsSnapshot:
    type: str
    hash: str


@dataclass(frozen=True)
class AccountSnapshot:
    id: str
    email: str
    role: Role
    credentials: CredentialsSnapshot
    status: AccountStatus
    last_authenticated_at: datetime | None = None
    version: int = 0


@dataclass(frozen=True)
class NewAccount:
    """What is needed to register a brand new account."""

    email: str
    role: Role
    password_hash: str
    #: An administrator's account is usable at once; a self-registered one awaits validation.
    activated: bool
