from dataclasses import replace

from architecture.domain.result import Failure, Success
from contexts.security.domain.account.account import Account
from contexts.security.domain.account.account_registration import AccountRegistration
from contexts.security.domain.account.dtos import NewAccount
from shared_kernel.domain.role import Role


class FakeAccountRepository:
    """A domain test needs only the port: a dict is enough of a repository."""

    def __init__(self) -> None:
        self._accounts: dict[str, Account] = {}

    async def find_by_id(self, id: str) -> Account | None:  # noqa: A002
        return self._accounts.get(id)

    async def find_by_email(self, email: str) -> Account | None:
        return next((a for a in self._accounts.values() if a.email.value == email.lower()), None)

    async def save(self, account: Account) -> None:
        self._accounts[account.id.value] = account


alice = NewAccount(email="alice@example.com", role=Role.USER, password_hash="h4sh", activated=False)


async def test_registers_an_account_for_a_free_email() -> None:
    result = await AccountRegistration(FakeAccountRepository()).register(alice)
    assert isinstance(result, Success) and result.data.email.value == "alice@example.com"


async def test_refuses_an_email_that_already_identifies_an_account_whatever_its_case() -> None:
    repository = FakeAccountRepository()
    registration = AccountRegistration(repository)
    first = await registration.register(alice)
    assert isinstance(first, Success)
    await repository.save(first.data)

    second = await registration.register(replace(alice, email="ALICE@example.com"))
    assert isinstance(second, Failure) and second.error.type == "AccountAlreadyExists"
