"""AccountRegistration is a domain service: it holds a business rule that no single aggregate can
enforce on its own. "An email identifies at most one account" is a statement about the whole
collection of accounts, so it needs the repository. It is still domain code: it depends on the
port, not on any implementation, and it carries no application concern (no logging, no
transaction, no event publishing)."""

from architecture.domain.result import Failure, Result
from contexts.security.domain.account.account import Account
from contexts.security.domain.account.account_exceptions import AccountAlreadyExistsException
from contexts.security.domain.account.dtos import NewAccount
from contexts.security.domain.account.ports.account_repository import AccountRepository
from shared_kernel.domain.email import Email


class AccountRegistration:
    def __init__(self, accounts: AccountRepository) -> None:
        self._accounts = accounts

    async def register(self, props: NewAccount) -> Result[Account]:
        email = Email.create(props.email)
        if isinstance(email, Failure):
            return email
        if await self._accounts.find_by_email(email.data.value) is not None:
            return Failure(AccountAlreadyExistsException(email.data.value))
        return Account.register(props)
