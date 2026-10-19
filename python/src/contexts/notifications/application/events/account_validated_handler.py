"""Anti-corruption layer towards Security: a validated account is welcomed by email."""

from architecture.application.event_handler import EventHandler
from architecture.application.execution_context import ExecutionContext
from architecture.domain.result import Result
from contexts.notifications.application.delivery import NotificationDelivery
from contexts.notifications.domain.notification.channel import Channel
from contexts.notifications.domain.notification.dtos import NewNotification
from shared_kernel.application.integration_events.account_integration_events import (
    AccountValidatedIntegrationEvent,
)


class AccountValidatedIntegrationEventHandler(EventHandler[AccountValidatedIntegrationEvent]):
    def __init__(self, delivery: NotificationDelivery) -> None:
        self._delivery = delivery

    async def execute(self, event: AccountValidatedIntegrationEvent, context: ExecutionContext) -> Result[str]:
        return await self._delivery.deliver(
            NewNotification(
                recipient_id=event.account_id,
                title="Welcome! Your account is now active",
                content=(
                    "<p>Your account has been verified. You now have full access to the platform.</p>"
                    "<p>Thank you for joining us!</p>"
                ),
                channels=[Channel.EMAIL],
                metadata={"email": event.email, "source": "Security.AccountValidated"},
            ),
            context,
        )
