import { Module } from '@SharedKernel/Application';
import {
  AccountCreatedIntegrationEvent,
  AccountValidatedIntegrationEvent,
} from '@SharedKernel/Application/IntegrationEvents/AccountIntegrationEvents';
import { NoteSharedIntegrationEvent } from '@SharedKernel/Application/IntegrationEvents/NoteIntegrationEvents';
import { OperationCompleteIntegrationEvent } from '@SharedKernel/Application/IntegrationEvents/TrackerIntegrationEvents';
import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';
import { ConsoleLogger } from '@SharedKernel/Infrastructure/Logging/ConsoleLogger';
import { SETTINGS } from '@Bootstrap/Fastify/application.settings';

import { INotification } from './Domain/Notification/DTOs';
import { NotificationDelivery } from './Application/Services/NotificationDelivery';
import { SendNotificationCommandEvent } from './Application/Commands/SendNotification/SendNotificationCommandEvent';
import { SendNotificationCommandHandler } from './Application/Commands/SendNotification/SendNotificationCommandHandler';
import { MarkAsReadNotificationCommandEvent } from './Application/Commands/MarkAsRead/MarkAsReadNotificationCommandEvent';
import { MarkAsReadNotificationCommandHandler } from './Application/Commands/MarkAsRead/MarkAsReadNotificationCommandHandler';
import { GetNotificationsQueryHandler } from './Application/Queries/GetNotifications/GetNotificationsQueryHandler';
import { AccountCreatedIntegrationEventHandler } from './Application/Events/AccountCreatedIntegrationEventHandler';
import { AccountValidatedIntegrationEventHandler } from './Application/Events/AccountValidatedIntegrationEventHandler';
import { NoteSharedIntegrationEventHandler } from './Application/Events/NoteSharedIntegrationEventHandler';
import { OperationCompleteIntegrationEventHandler } from './Application/Events/OperationCompleteIntegrationEventHandler';
import { InMemoryNotificationRepository } from './Infrastructure/Repositories/InMemoryNotificationRepository';
import { InMemoryNotificationQueries } from './Infrastructure/Queries/InMemoryNotificationQueries';
import { EmailChannel } from './Infrastructure/Channels/EmailChannel';
import { WebSocketChannel } from './Infrastructure/Channels/WebSocketChannel';
import { NotificationHTMXPresenter } from './Presentation/Presenters/HTMX/NotificationHTMXPresenter';

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
  ],
});
