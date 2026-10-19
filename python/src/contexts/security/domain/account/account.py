"""Account is the aggregate root of the Security context: who can sign in, and as what.

- an account always has a valid email and a set of credentials (value objects)
- it is PENDING until validated, and only an ACTIVE account can authenticate
- the email must be unique across accounts: that rule spans the whole collection, so it lives
  in the AccountRegistration domain service, not here

Checking a password against the stored hash is not business: the application layer asks the
PasswordHasher port, then calls ``authenticate()`` to record the fact.
"""

from datetime import UTC, datetime

from architecture.domain.aggregate_root import AggregateRoot
from architecture.domain.id import Id
from architecture.domain.result import Failure, Result, Success
from contexts.security.domain.account.account_exceptions import (
    AccountAlreadyActiveException,
    InactiveAccountException,
)
from contexts.security.domain.account.account_status import AccountStatus
from contexts.security.domain.account.credentials import Credentials
from contexts.security.domain.account.dtos import AccountSnapshot, CredentialsSnapshot, NewAccount
from contexts.security.domain.account.events import (
    AccountAuthenticatedEvent,
    AccountCreatedEvent,
    AccountValidatedEvent,
)
from shared_kernel.domain.email import Email
from shared_kernel.domain.role import Role

OK: Result[None] = Success(None)


class Account(AggregateRoot):
    __slots__ = ("_credentials", "_email", "_last_authenticated_at", "_role", "_status")

    def __init__(
        self,
        id: Id,  # noqa: A002
        email: Email,
        role: Role,
        credentials: Credentials,
        status: AccountStatus,
        last_authenticated_at: datetime | None = None,
        version: int = 0,
    ) -> None:
        """Private: the only ways in are ``register()`` and ``from_snapshot()``."""
        super().__init__(id, version)
        self._email = email
        self._role = role
        self._credentials = credentials
        self._status = status
        self._last_authenticated_at = last_authenticated_at

    @staticmethod
    def register(props: NewAccount) -> Result["Account"]:
        """Opens a brand new account. Uniqueness of the email is checked by AccountRegistration."""
        email = Email.create(props.email)
        if isinstance(email, Failure):
            return email
        credentials = Credentials.create(props.password_hash)
        if isinstance(credentials, Failure):
            return credentials

        id = Id.generate()  # noqa: A001
        status = AccountStatus.ACTIVE if props.activated else AccountStatus.PENDING
        account = Account(id, email.data, props.role, credentials.data, status)
        account._record(
            AccountCreatedEvent(account_id=id.value, email=email.data.value, role=props.role, status=status)
        )
        return Success(account)

    @staticmethod
    def from_snapshot(snapshot: AccountSnapshot) -> "Account":
        """Rebuilds an Account from what was persisted. No event is recorded: nothing new happened."""
        email = Email.create(snapshot.email)
        credentials = Credentials.create(snapshot.credentials.hash)
        if isinstance(email, Failure) or isinstance(credentials, Failure):
            raise ValueError(f"Corrupted account {snapshot.id}")
        return Account(
            Id(snapshot.id),
            email.data,
            snapshot.role,
            credentials.data,
            snapshot.status,
            snapshot.last_authenticated_at,
            snapshot.version,
        )

    def validate(self) -> Result[None]:
        """Confirms the email address: the account becomes usable."""
        if self._status is AccountStatus.ACTIVE:
            return Failure(AccountAlreadyActiveException(self.id.value))
        self._status = AccountStatus.ACTIVE
        self._record(AccountValidatedEvent(account_id=self.id.value, email=self._email.value))
        return OK

    def authenticate(self, now: datetime | None = None) -> Result[None]:
        """Records a successful sign-in. The caller has already verified the credentials."""
        if self._status is not AccountStatus.ACTIVE:
            return Failure(InactiveAccountException(self.id.value))
        at = now or datetime.now(UTC)
        self._last_authenticated_at = at
        self._record(AccountAuthenticatedEvent(account_id=self.id.value, at=at))
        return OK

    def to_snapshot(self) -> AccountSnapshot:
        return AccountSnapshot(
            id=self.id.value,
            email=self._email.value,
            role=self._role,
            credentials=CredentialsSnapshot(type=self._credentials.type, hash=self._credentials.hash),
            status=self._status,
            last_authenticated_at=self._last_authenticated_at,
            version=self.version,
        )

    @property
    def email(self) -> Email:
        return self._email

    @property
    def role(self) -> Role:
        return self._role

    @property
    def credentials(self) -> Credentials:
        return self._credentials

    @property
    def status(self) -> AccountStatus:
        return self._status

    @property
    def last_authenticated_at(self) -> datetime | None:
        return self._last_authenticated_at
