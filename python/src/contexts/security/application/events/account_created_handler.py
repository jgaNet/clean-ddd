"""Translates the domain fact into what other contexts need: a validation token the
Notifications context will email to the new account. An account opened active (by an
administrator, or the seed) has nothing to validate, so nothing leaves the context."""

from architecture.application.event_handler import EventHandler
from architecture.application.execution_context import ExecutionContext
from architecture.domain.result import Result, Success
from contexts.security.domain.account.account_status import AccountStatus
from contexts.security.domain.account.events import AccountCreatedEvent
from contexts.security.domain.auth.ports.signed_tokens import SignedTokens, TokenPayload
from contexts.security.domain.auth.token_types import TokenTypes
from shared_kernel.application.integration_events.account_integration_events import AccountCreatedIntegrationEvent


class AccountCreatedHandler(EventHandler[AccountCreatedEvent]):
    def __init__(self, tokens: SignedTokens) -> None:
        self._tokens = tokens

    async def execute(self, event: AccountCreatedEvent, context: ExecutionContext) -> Result[None]:
        if context.logger:
            context.logger.debug(f"Account {event.account_id} created", {"traceId": context.trace_id})
        if event.status is AccountStatus.ACTIVE:
            return Success(None)

        validation_token = await self._tokens.issue(
            TokenPayload(subject_id=event.account_id, subject_type=TokenTypes.VALIDATION)
        )
        context.event_bus.publish(
            AccountCreatedIntegrationEvent(
                account_id=event.account_id, email=event.email, validation_token=validation_token
            ),
            context,
        )
        return Success(None)
