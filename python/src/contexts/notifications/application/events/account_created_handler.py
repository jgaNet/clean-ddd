"""Anti-corruption layer towards Security: a new account gets its validation link by email."""

from architecture.application.event_handler import EventHandler
from architecture.application.execution_context import ExecutionContext
from architecture.domain.result import Result
from contexts.notifications.application.delivery import NotificationDelivery
from contexts.notifications.domain.notification.channel import Channel
from contexts.notifications.domain.notification.dtos import NewNotification
from shared_kernel.application.integration_events.account_integration_events import AccountCreatedIntegrationEvent


class AccountCreatedIntegrationEventHandler(EventHandler[AccountCreatedIntegrationEvent]):
    def __init__(self, url: str, delivery: NotificationDelivery) -> None:
        self._url = url
        self._delivery = delivery

    async def execute(self, event: AccountCreatedIntegrationEvent, context: ExecutionContext) -> Result[str]:
        link = f"{self._url}/auth/validate?validation_token={event.validation_token}"
        return await self._delivery.deliver(
            NewNotification(
                recipient_id=event.account_id,
                title="Welcome - verify your account",
                content=(
                    "<p>Thank you for creating an account!</p>"
                    "<p>Please verify it by clicking on the link below:</p>"
                    f'<p><a href="{link}">Verify your account</a></p>'
                    "<p>This link will expire in 24 hours.</p>"
                ),
                channels=[Channel.EMAIL],
                metadata={"email": event.email, "source": "Security.AccountCreated"},
            ),
            context,
        )
