"""Login answers synchronously (the caller needs the token), so the controller runs the handler
through the module instead of publishing the command on the bus: the token is answered, and the
Tracker never sees it."""

from dataclasses import dataclass

from architecture.application.command_handler import CommandHandler
from architecture.application.execution_context import ExecutionContext
from architecture.domain.event import CommandEvent
from architecture.domain.result import Failure, Result, Success
from contexts.security.domain.account.account_exceptions import InvalidCredentialsException
from contexts.security.domain.account.ports.account_repository import AccountRepository
from contexts.security.domain.auth.ports.password_hasher import PasswordHasher
from contexts.security.domain.auth.ports.signed_tokens import SignedTokens, TokenPayload


@dataclass(frozen=True)
class LoginCommandEvent(CommandEvent):
    identifier: str  # the account's email; the field is named for what a login form calls it
    password: str


class LoginCommandHandler(CommandHandler[LoginCommandEvent]):
    def __init__(self, accounts: AccountRepository, hasher: PasswordHasher, tokens: SignedTokens) -> None:
        self._accounts = accounts
        self._hasher = hasher
        self._tokens = tokens

    async def execute(self, command: LoginCommandEvent, context: ExecutionContext) -> Result[str]:
        """The session token, for an active account with the right password."""
        account = await self._accounts.find_by_email(command.identifier)
        if account is None:
            return Failure(InvalidCredentialsException())
        if not await self._hasher.compare(command.password, account.credentials.hash):
            return Failure(InvalidCredentialsException())

        authenticated = account.authenticate()
        if isinstance(authenticated, Failure):
            return authenticated

        await self._accounts.save(account)
        self.publish_domain_events(account, context)

        return Success(await self._tokens.issue(TokenPayload(subject_id=account.id.value, subject_type=account.role)))
