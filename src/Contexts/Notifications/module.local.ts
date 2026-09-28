import { Module } from '@SharedKernel/Application';
import {
  AccountCreatedIntegrationEvent,
  AccountValidatedIntegrationEvent,
} from '@SharedKernel/Application/IntegrationEvents/AccountIntegrationEvents';
import { OperationCompleteIntegrationEvent } from '@SharedKernel/Application/IntegrationEvents/TrackerIntegrationEvents';
import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';
import { ConsoleLogger } from '@SharedKernel/Infrastructure/Logging/ConsoleLogger';
import { SETTINGS } from '@Bootstrap/Fastify/application.settings';

import { INotification } from './Domain/Notification/DTOs';
import { SendNotificationCommandEvent } from './Application/Commands/SendNotification/SendNotificationCommandEvent';
import { SendNotificationCommandHandler } from './Application/Commands/SendNotification/SendNotificationCommandHandler';
import { MarkAsReadNotificationCommandEvent } from './Application/Commands/MarkAsRead/MarkAsReadNotificationCommandEvent';
import { MarkAsReadNotificationCommandHandler } from './Application/Commands/MarkAsRead/MarkAsReadNotificationCommandHandler';
import { GetNotificationsQueryHandler } from './Application/Queries/GetNotifications/GetNotificationsQueryHandler';
import { AccountCreatedIntegrationEventHandler } from './Application/Events/AccountCreatedIntegrationEventHandler';
import { AccountValidatedIntegrationEventHandler } from './Application/Events/AccountValidatedIntegrationEventHandler';
import { OperationCompleteIntegrationEventHandler } from './Application/Events/OperationCompleteIntegrationEventHandler';
import { InMemoryNotificationRepository } from './Infrastructure/Repositories/InMemoryNotificationRepository';
import { InMemoryNotificationQueries } from './Infrastructure/Queries/InMemoryNotificationQueries';
import { EmailNotificationService } from './Infrastructure/Services/EmailNotificationService';
import { FastifyHTMXWebSocketService } from './Infrastructure/Services/FastifyHTMXWebSocketService';
import { NotificationDeliveryService } from './Infrastructure/Services/NotificationDeliveryService';

const notificationDataSource = new InMemoryDataSource<INotification>();
const logger = new ConsoleLogger({ debug: SETTINGS.logger.debug });

// Exported because the Fastify bootstrap must attach it to the server before listening.
export const webSocketService = new FastifyHTMXWebSocketService(logger);
const emailService = new EmailNotificationService({
  smtpHost: process.env.SMTP_HOST || 'localhost',
  smtpPort: Number(process.env.SMTP_PORT) || 25,
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
  fromEmail: process.env.FROM_EMAIL || 'noreply@example.com',
});

const notificationRepository = new InMemoryNotificationRepository(notificationDataSource);
const notificationQueries = new InMemoryNotificationQueries(notificationDataSource);
const notificationService = new NotificationDeliveryService(webSocketService, emailService, notificationRepository);

export const localNotificationsModule = new Module({
  name: 'Notifications',
  commands: [
    {
      event: SendNotificationCommandEvent,
      handlers: [new SendNotificationCommandHandler(notificationRepository, [emailService])],
    },
    {
      event: MarkAsReadNotificationCommandEvent,
      handlers: [new MarkAsReadNotificationCommandHandler(notificationRepository, notificationQueries)],
    },
  ],
  queries: [new GetNotificationsQueryHandler(notificationQueries)],
  integrationEvents: [
    {
      event: AccountCreatedIntegrationEvent,
      handlers: [new AccountCreatedIntegrationEventHandler(SETTINGS.url, notificationService)],
    },
    {
      event: AccountValidatedIntegrationEvent,
      handlers: [new AccountValidatedIntegrationEventHandler(notificationService)],
    },
    {
      event: OperationCompleteIntegrationEvent,
      handlers: [new OperationCompleteIntegrationEventHandler(notificationService)],
    },
  ],
});
