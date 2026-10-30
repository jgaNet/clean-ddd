from architecture.application.domain_events import publish_integration_event
from architecture.application.event_handler import EventHandler
from architecture.application.execution_context import ExecutionContext
from architecture.domain.result import Result, Success
from contexts.security.domain.account.events import AccountValidatedEvent
from shared_kernel.application.integration_events.account_integration_events import (
    AccountValidatedIntegrationEvent,
)


class AccountValidatedHandler(EventHandler[AccountValidatedEvent]):
    async def execute(self, event: AccountValidatedEvent, context: ExecutionContext) -> Result[None]:
        if context.logger:
            context.logger.debug(f"Account {event.account_id} validated", {"traceId": context.trace_id})
        publish_integration_event(
            AccountValidatedIntegrationEvent(account_id=event.account_id, email=event.email), context
        )
        return Success(None)
