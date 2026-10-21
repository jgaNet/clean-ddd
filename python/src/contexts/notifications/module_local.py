"""The wiring of the Notifications context: the store, the channels, the delivery service every
entry point ends in, and the module listing the commands, the inbox query and the five
anti-corruption handlers on the contracts they consume. The websocket channel is exposed: the
composition root mounts its ``/ws`` route beside the API."""

from dataclasses import dataclass

from architecture.application.execution_context import Logger
from architecture.application.module import Module, Subscription
from architecture.infrastructure.data_sources import InMemoryDataSource
from contexts.notifications.application.commands.mark_as_read import (
    MarkAsReadNotificationCommandEvent,
    MarkAsReadNotificationCommandHandler,
)
from contexts.notifications.application.commands.send_notification import (
    SendNotificationCommandEvent,
    SendNotificationCommandHandler,
)
from contexts.notifications.application.delivery import NotificationDelivery
from contexts.notifications.application.events.account_created_handler import AccountCreatedIntegrationEventHandler
from contexts.notifications.application.events.account_validated_handler import (
    AccountValidatedIntegrationEventHandler,
)
from contexts.notifications.application.events.note_archived_handler import NoteArchivedIntegrationEventHandler
from contexts.notifications.application.events.note_shared_handler import NoteSharedIntegrationEventHandler
from contexts.notifications.application.events.operation_complete_handler import (
    OperationCompleteIntegrationEventHandler,
)
from contexts.notifications.application.queries.get_notifications import GetNotificationsQueryHandler
from contexts.notifications.domain.notification.dtos import NotificationSnapshot
from contexts.notifications.infrastructure.channels.email import EmailChannel
from contexts.notifications.infrastructure.channels.websocket import WebSocketChannel
from contexts.notifications.infrastructure.queries import InMemoryNotificationQueries
from contexts.notifications.infrastructure.repositories import InMemoryNotificationRepository
from contexts.notifications.presentation.presenters import NotificationHtmxPresenter
from shared_kernel.application.integration_events.account_integration_events import (
    AccountCreatedIntegrationEvent,
    AccountValidatedIntegrationEvent,
)
from shared_kernel.application.integration_events.note_integration_events import (
    NoteArchivedIntegrationEvent,
    NoteSharedIntegrationEvent,
)
from shared_kernel.application.integration_events.tracker_integration_events import (
    OperationCompleteIntegrationEvent,
)

NotificationStore = InMemoryDataSource[NotificationSnapshot]


def notification_store() -> NotificationStore:
    return InMemoryDataSource()


@dataclass(frozen=True)
class NotificationsSettings:
    #: The public URL of the API, for the links in the emails.
    url: str
    from_email: str


class NotificationsWiring:
    """The module, and the websocket channel the composition root mounts."""

    def __init__(self, store: NotificationStore, settings: NotificationsSettings, logger: Logger | None) -> None:
        repository = InMemoryNotificationRepository(store)
        queries = InMemoryNotificationQueries(store)

        htmx = NotificationHtmxPresenter()
        self.websocket = WebSocketChannel(logger, htmx.present)
        email = EmailChannel(logger, settings.from_email)
        delivery = NotificationDelivery(repository, [self.websocket, email])

        self.module = Module(
            name="Notifications",
            commands=[
                Subscription(SendNotificationCommandEvent, [SendNotificationCommandHandler(delivery)]),
                Subscription(MarkAsReadNotificationCommandEvent, [MarkAsReadNotificationCommandHandler(repository)]),
            ],
            queries=[GetNotificationsQueryHandler(queries)],
            integration_events=[
                Subscription(
                    AccountCreatedIntegrationEvent, [AccountCreatedIntegrationEventHandler(settings.url, delivery)]
                ),
                Subscription(AccountValidatedIntegrationEvent, [AccountValidatedIntegrationEventHandler(delivery)]),
                Subscription(OperationCompleteIntegrationEvent, [OperationCompleteIntegrationEventHandler(delivery)]),
                Subscription(NoteSharedIntegrationEvent, [NoteSharedIntegrationEventHandler(delivery)]),
                Subscription(NoteArchivedIntegrationEvent, [NoteArchivedIntegrationEventHandler(delivery)]),
            ],
        )


def local_notifications_module(
    store: NotificationStore, settings: NotificationsSettings, logger: Logger | None
) -> NotificationsWiring:
    return NotificationsWiring(store, settings, logger)
