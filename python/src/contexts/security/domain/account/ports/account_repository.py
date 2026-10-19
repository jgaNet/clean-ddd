"""Write side of persistence: loads and saves the Account aggregate. ``find_by_email`` is here,
not in the queries, because the domain itself needs it (AccountRegistration) and the result is
an aggregate, not a read model."""

from typing import Protocol

from contexts.security.domain.account.account import Account


class AccountRepository(Protocol):
    async def find_by_id(self, id: str) -> Account | None: ...  # noqa: A002

    async def find_by_email(self, email: str) -> Account | None: ...

    async def save(self, account: Account) -> None: ...
