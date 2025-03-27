import { ModuleBuilder } from '@SharedKernel/Domain/Application/Module';
import { SendNotificationCommandEvent } from './Application/Commands/SendNotification/SendNotificationCommandEvent';
import { SendNotificationCommandHandler } from './Application/Commands/SendNotification/SendNotificationCommandHandler';
import { MarkAsReadNotificationCommandEvent } from './Application/Commands/MarkAsRead/MarkAsReadNotificationCommandEvent';
import { MarkAsReadNotificationCommandHandler } from './Application/Commands/MarkAsRead/MarkAsReadNotificationCommandHandler';
import { GetNotificationsQueryHandler } from './Application/Queries/GetNotifications/GetNotificationsQueryHandler';
import { NotificationSentEvent } from './Domain/Notification/Events/NotificationSentEvent';
import {
  AccountCreatedIntegrationEvent,
  AccountValidatedIntegrationEvent,
} from '@SharedKernel/Application/IntegrationEvents/AccountIntegrationEvents';
import { AccountCreatedIntegrationEventHandler } from './Application/Events/AccountCreatedIntegrationEventHandler';
import { AccountValidatedIntegrationEventHandler } from './Application/Events/AccountValidatedIntegrationEventHandler';
import { OperationCompleteIntegrationEvent } from '@SharedKernel/Application/IntegrationEvents/TrackerIntegrationEvents';
import { OperationCompleteIntegrationEventHandler } from './Application/Events/OperationCompleteIntegrationEventHandler';

import { InMemoryNotificationRepository } from './Infrastructure/Repositories/InMemoryNotificationRepository';
import { InMemoryNotificationQueries } from './Infrastructure/Queries/InMemoryNotificationQueries';
import { EmailNotificationService } from './Infrastructure/Services/EmailNotificationService';
import { FastifyHTMXWebSocketService } from './Infrastructure/Services/FastifyHTMXWebSocketService';
import { NotificationDeliveryService } from './Infrastructure/Services/NotificationDeliveryService';
import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';
import { INotification } from './Domain/Notification/DTOs';

// Import the account queries from Security module
import { SETTINGS } from '@Bootstrap/Fastify/application.settings';
import { ConsoleLogger } from '@SharedKernel/Infrastructure/Logging/ConsoleLogger';
import { NotificationsModule } from './Application';

// Create shared infrastructure
const notificationDataSource = new InMemoryDataSource<INotification>();
const logger = new ConsoleLogger({ debug: SETTINGS.logger.debug });

// Create services
const webSocketService = new FastifyHTMXWebSocketService(logger);
const emailService = new EmailNotificationService({
  smtpHost: process.env.SMTP_HOST || 'localhost',
  smtpPort: Number(process.env.SMTP_PORT) || 25,
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
  fromEmail: process.env.FROM_EMAIL || 'noreply@example.com',
});

// Create delivery service
const notificationRepository = new InMemoryNotificationRepository(notificationDataSource);
const notificationQueries = new InMemoryNotificationQueries(notificationDataSource);

const notificationService = new NotificationDeliveryService(webSocketService, emailService, notificationRepository);

// Create event handlers
const operationCompleteEventHandler = new OperationCompleteIntegrationEventHandler(notificationService);

// Build module with exported services
export const localNotificationsModule = new ModuleBuilder<NotificationsModule>(Symbol('Notifications'))
  // Commands
  .setCommand({
    event: SendNotificationCommandEvent,
    handlers: [new SendNotificationCommandHandler(notificationRepository, [emailService])],
  })
  .setCommand({
    event: MarkAsReadNotificationCommandEvent,
    handlers: [new MarkAsReadNotificationCommandHandler(notificationRepository, notificationQueries)],
  })
  // Queries
  .setQuery(new GetNotificationsQueryHandler(notificationQueries))
  // Domain Events
  .setDomainEvent({
    event: NotificationSentEvent,
    handlers: [],
  })
  // Integration Events
  .setIntegrationEvent({
    event: AccountCreatedIntegrationEvent,
    handlers: [new AccountCreatedIntegrationEventHandler(SETTINGS.url, notificationService)],
  })
  .setIntegrationEvent({
    event: AccountValidatedIntegrationEvent,
    handlers: [new AccountValidatedIntegrationEventHandler(notificationService)],
  })
  .setIntegrationEvent({
    event: OperationCompleteIntegrationEvent,
    handlers: [operationCompleteEventHandler],
  })
  // Services
  .setService('webSocketService', webSocketService)
  .build();
