import { Module } from '@SharedKernel/Application';
import {
  AccountCreatedIntegrationEvent,
  AccountValidatedIntegrationEvent,
} from '@SharedKernel/Application/IntegrationEvents/AccountIntegrationEvents';
import {
  NoteArchivedIntegrationEvent,
  NoteSharedIntegrationEvent,
} from '@SharedKernel/Application/IntegrationEvents/NoteIntegrationEvents';
import { OperationCompleteIntegrationEvent } from '@SharedKernel/Application/IntegrationEvents/TrackerIntegrationEvents';
import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';
import { ConsoleLogger } from '@SharedKernel/Infrastructure/Logging/ConsoleLogger';
import { SETTINGS } from '@Bootstrap/Fastify/application.settings';

import { INotification } from '@Contexts/Notifications/Domain/Notification/DTOs';
import { NotificationDelivery } from '@Contexts/Notifications/Application/Services/NotificationDelivery';
import { SendNotificationCommandEvent } from '@Contexts/Notifications/Application/Commands/SendNotification/SendNotificationCommandEvent';
import { SendNotificationCommandHandler } from '@Contexts/Notifications/Application/Commands/SendNotification/SendNotificationCommandHandler';
import { MarkAsReadNotificationCommandEvent } from '@Contexts/Notifications/Application/Commands/MarkAsRead/MarkAsReadNotificationCommandEvent';
import { MarkAsReadNotificationCommandHandler } from '@Contexts/Notifications/Application/Commands/MarkAsRead/MarkAsReadNotificationCommandHandler';
import { GetNotificationsQueryHandler } from '@Contexts/Notifications/Application/Queries/GetNotifications/GetNotificationsQueryHandler';
import { AccountCreatedIntegrationEventHandler } from '@Contexts/Notifications/Application/Events/AccountCreatedIntegrationEventHandler';
import { AccountValidatedIntegrationEventHandler } from '@Contexts/Notifications/Application/Events/AccountValidatedIntegrationEventHandler';
import { NoteArchivedIntegrationEventHandler } from '@Contexts/Notifications/Application/Events/NoteArchivedIntegrationEventHandler';
import { NoteSharedIntegrationEventHandler } from '@Contexts/Notifications/Application/Events/NoteSharedIntegrationEventHandler';
import { OperationCompleteIntegrationEventHandler } from '@Contexts/Notifications/Application/Events/OperationCompleteIntegrationEventHandler';
import { InMemoryNotificationRepository } from '@Contexts/Notifications/Infrastructure/Repositories/InMemoryNotificationRepository';
import { InMemoryNotificationQueries } from '@Contexts/Notifications/Infrastructure/Queries/InMemoryNotificationQueries';
import { EmailChannel } from '@Contexts/Notifications/Infrastructure/Channels/EmailChannel';
import { WebSocketChannel } from '@Contexts/Notifications/Infrastructure/Channels/WebSocketChannel';
import { NotificationHTMXPresenter } from '@Contexts/Notifications/Presentation/Presenters/HTMX/NotificationHTMXPresenter';

const logger = new ConsoleLogger({ debug: SETTINGS.logger.debug });
const notificationDataSource = new InMemoryDataSource<INotification>();
const notificationRepository = new InMemoryNotificationRepository(notificationDataSource);
const notificationQueries = new InMemoryNotificationQueries(notificationDataSource);

// Channels. The websocket one is exported: the bootstrap attaches it to the server before listening.
const htmx = new NotificationHTMXPresenter();
export const webSocketChannel = new WebSocketChannel(logger, delivery => htmx.present(delivery));
const emailChannel = new EmailChannel(logger, { fromEmail: process.env.FROM_EMAIL || 'noreply@example.com' });

const delivery = new NotificationDelivery(notificationRepository, [webSocketChannel, emailChannel]);

export const localNotificationsModule = new Module({
  name: 'Notifications',
  commands: [
    { event: SendNotificationCommandEvent, handlers: [new SendNotificationCommandHandler(delivery)] },
    {
      event: MarkAsReadNotificationCommandEvent,
      handlers: [new MarkAsReadNotificationCommandHandler(notificationRepository)],
    },
  ],
  queries: [new GetNotificationsQueryHandler(notificationQueries)],
  integrationEvents: [
    {
      event: AccountCreatedIntegrationEvent,
      handlers: [new AccountCreatedIntegrationEventHandler(SETTINGS.url, delivery)],
    },
    { event: AccountValidatedIntegrationEvent, handlers: [new AccountValidatedIntegrationEventHandler(delivery)] },
    { event: OperationCompleteIntegrationEvent, handlers: [new OperationCompleteIntegrationEventHandler(delivery)] },
    { event: NoteSharedIntegrationEvent, handlers: [new NoteSharedIntegrationEventHandler(delivery)] },
    { event: NoteArchivedIntegrationEvent, handlers: [new NoteArchivedIntegrationEventHandler(delivery)] },
  ],
});
