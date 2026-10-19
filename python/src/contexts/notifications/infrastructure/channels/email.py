"""Email delivery. This reference project has no mail server: the adapter logs what it would
send. A real one would hand the same Delivery to an SMTP client or a provider API, and nothing
above this file would change."""

from architecture.application.execution_context import Logger
from architecture.domain.common_exceptions import UnknownException
from architecture.domain.result import Failure, Result, Success
from contexts.notifications.domain.notification.channel import Channel
from contexts.notifications.domain.notification.ports.notification_channel import Delivery


class EmailChannel:
    channel = Channel.EMAIL

    def __init__(self, logger: Logger | None, from_email: str) -> None:
        self._logger = logger
        self._from = from_email

    async def is_available_for(self, recipient_id: str) -> bool:
        return True

    async def deliver(self, delivery: Delivery) -> Result[None]:
        to = delivery.metadata.get("email")
        if not isinstance(to, str) or not to:
            return Failure(UnknownException(f"No email address for recipient {delivery.recipient_id}"))
        if self._logger:
            self._logger.info(f"[EMAIL] from {self._from} to {to}: {delivery.title}")
            self._logger.debug(delivery.content)
        return Success(None)
