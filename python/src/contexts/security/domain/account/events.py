"""Facts raised by the Account aggregate. They stay inside the Security context; the application
handlers translate the ones other contexts care about into integration events."""

from dataclasses import dataclass
from datetime import datetime

from architecture.domain.event import DomainEvent
from contexts.security.domain.account.account_status import AccountStatus
from shared_kernel.domain.role import Role


@dataclass(frozen=True)
class AccountCreatedEvent(DomainEvent):
    account_id: str
    email: str
    role: Role
    status: AccountStatus


@dataclass(frozen=True)
class AccountValidatedEvent(DomainEvent):
    account_id: str
    email: str


@dataclass(frozen=True)
class AccountAuthenticatedEvent(DomainEvent):
    account_id: str
    at: datetime
