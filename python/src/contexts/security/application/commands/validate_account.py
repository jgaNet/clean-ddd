"""Who may validate an account: an administrator, for any account, or whoever holds the
validation token that was emailed for it. The token is verified here, not in the controller,
so that the rule cannot be bypassed by publishing the command another way. Two ways to ask,
one command: nothing in the payload is taken as proof of anything."""

from dataclasses import dataclass

from architecture.application.command_handler import CommandHandler
from architecture.application.execution_context import ExecutionContext
from architecture.domain.common_exceptions import NotAllowedException
from architecture.domain.event import CommandEvent
from architecture.domain.result import Failure, Result, Success
from contexts.security.domain.account.account_exceptions import SERVICE, AccountNotFoundException
from contexts.security.domain.account.ports.account_repository import AccountRepository
from contexts.security.domain.auth.ports.signed_tokens import SignedTokens
from contexts.security.domain.auth.token_types import TokenTypes
from shared_kernel.domain.role import Role


@dataclass(frozen=True)
class ValidateAccountCommandEvent(CommandEvent):
    """By token (anyone holding it) or by account id (administrators only); one of the two."""

    validation_token: str | None = None
    account_id: str | None = None


class ValidateAccountCommandHandler(CommandHandler[ValidateAccountCommandEvent]):
    def __init__(self, accounts: AccountRepository, tokens: SignedTokens) -> None:
        self._accounts = accounts
        self._tokens = tokens

    async def execute(self, command: ValidateAccountCommandEvent, context: ExecutionContext) -> Result[str]:
        account_id = await self._account_id_allowed_for(command, context)
        if isinstance(account_id, Failure):
            return account_id

        account = await self._accounts.find_by_id(account_id.data)
        if account is None:
            return Failure(AccountNotFoundException(account_id.data))

        validated = account.validate()
        if isinstance(validated, Failure):
            return validated

        await self._accounts.save(account)
        self.publish_domain_events(account, context)
        return Success(account.id.value)

    async def _account_id_allowed_for(
        self, command: ValidateAccountCommandEvent, context: ExecutionContext
    ) -> Result[str]:
        if command.validation_token is not None:
            claims = await self._tokens.verify(command.validation_token)
            if claims is None or claims.subject_type != TokenTypes.VALIDATION:
                return Failure(NotAllowedException(SERVICE, "Invalid validation token"))
            return Success(claims.subject_id)

        if Role.parse(context.auth.role) is not Role.ADMIN:
            return Failure(NotAllowedException(SERVICE, "Only an administrator can validate an account by id"))
        if command.account_id is None:
            return Failure(AccountNotFoundException(""))
        return Success(command.account_id)
