"""Reserved to administrators (and to the bootstrap, acting as the system). The account is
usable at once. The rule needs no caller id, so it is a ``guard()`` override, which only
``handle()`` runs: its test goes through an operation, as the bus would."""

from dataclasses import dataclass
from typing import Any

from architecture.application.command_handler import OK, CommandHandler
from architecture.application.execution_context import ExecutionContext
from architecture.domain.common_exceptions import NotAllowedException
from architecture.domain.event import CommandEvent
from architecture.domain.result import Failure, Result, Success
from contexts.security.domain.account.account_exceptions import SERVICE
from contexts.security.domain.account.account_registration import AccountRegistration
from contexts.security.domain.account.dtos import NewAccount
from contexts.security.domain.account.ports.account_repository import AccountRepository
from contexts.security.domain.auth.ports.password_hasher import PasswordHasher
from shared_kernel.domain.role import Role


@dataclass(frozen=True)
class RegisterAdminCommandEvent(CommandEvent):
    email: str
    password: str


class RegisterAdminCommandHandler(CommandHandler[RegisterAdminCommandEvent]):
    def __init__(self, accounts: AccountRepository, registration: AccountRegistration, hasher: PasswordHasher) -> None:
        self._accounts = accounts
        self._registration = registration
        self._hasher = hasher

    async def guard(self, command: RegisterAdminCommandEvent, context: ExecutionContext) -> Result[Any]:
        if Role.parse(context.auth.role) is not Role.ADMIN:
            return Failure(NotAllowedException(SERVICE, "Only an administrator can register another one"))
        return OK

    async def execute(self, command: RegisterAdminCommandEvent, context: ExecutionContext) -> Result[str]:
        account = await self._registration.register(
            NewAccount(
                email=command.email,
                role=Role.ADMIN,
                password_hash=await self._hasher.hash(command.password),
                activated=True,
            )
        )
        if isinstance(account, Failure):
            return account

        await self._accounts.save(account.data)
        self.publish_domain_events(account.data, context)
        return Success(account.data.id.value)
