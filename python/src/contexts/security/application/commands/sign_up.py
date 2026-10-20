"""Self-registration: anyone may sign up, the account stays PENDING until the email is
validated (see AccountCreatedHandler, which sends the validation token). The password travels
in clear inside the process only; it is hashed before anything is stored."""

from dataclasses import dataclass

from architecture.application.command_handler import CommandHandler
from architecture.application.execution_context import ExecutionContext
from architecture.domain.event import CommandEvent
from architecture.domain.result import Failure, Result, Success
from contexts.security.domain.account.account_registration import AccountRegistration
from contexts.security.domain.account.dtos import NewAccount
from contexts.security.domain.account.ports.account_repository import AccountRepository
from contexts.security.domain.auth.ports.password_hasher import PasswordHasher
from shared_kernel.domain.role import Role


@dataclass(frozen=True)
class SignUpCommandEvent(CommandEvent):
    email: str
    password: str


class SignUpCommandHandler(CommandHandler[SignUpCommandEvent]):
    def __init__(self, accounts: AccountRepository, registration: AccountRegistration, hasher: PasswordHasher) -> None:
        self._accounts = accounts
        self._registration = registration
        self._hasher = hasher

    async def execute(self, command: SignUpCommandEvent, context: ExecutionContext) -> Result[str]:
        account = await self._registration.register(
            NewAccount(
                email=command.email,
                role=Role.USER,
                password_hash=await self._hasher.hash(command.password),
                activated=False,
            )
        )
        if isinstance(account, Failure):
            return account

        await self._accounts.save(account.data)
        self.publish_domain_events(account.data, context)
        return Success(account.data.id.value)
