import { Event, EventHandler, CommandHandler } from '@SharedKernel/Domain';
import { NotificationStatus, NotificationType } from '../Domain/Notification/Notification';
import { NotificationSentEvent } from '../Domain/Notification/Events/NotificationSentEvent';
import { SendNotificationCommandEvent } from './Commands/SendNotification/SendNotificationCommandEvent';
import { MarkAsReadNotificationCommandEvent } from './Commands/MarkAsRead/MarkAsReadNotificationCommandEvent';
import { GetNotificationsQueryHandler } from './Queries/GetNotifications/GetNotificationsQueryHandler';
import { AccountCreatedIntegrationEvent } from '@SharedKernel/Application/IntegrationEvents/AccountIntegrationEvents';
import { AccountValidatedIntegrationEvent } from '@SharedKernel/Application/IntegrationEvents/AccountIntegrationEvents';
import { OperationCompleteIntegrationEvent } from '@SharedKernel/Application/IntegrationEvents/TrackerIntegrationEvents';
import { FastifyWebSocketService } from '../Infrastructure/Services/FastifyWebSocketService';

export interface NotificationDTO {
  id: string;
  recipientId: string;
  type: NotificationType;
  title: string;
  content: string;
  status: NotificationStatus;
  createdAt: string;
  sentAt?: string | null;
  readAt?: string | null;
  metadata?: Record<string, unknown>;
}

export interface SendNotificationDTO {
  recipientId: string;
  type: NotificationType;
  title: string;
  content: string;
  deliveryStrategy: string[];
  metadata?: Record<string, unknown>;
  isManual?: boolean;
}

export interface GetNotificationsDTO {
  recipientId?: string;
  limit?: number;
  offset?: number;
  onlyUnread?: boolean;
}

export interface NotificationListResponseDTO {
  notifications: NotificationDTO[];
  total: number;
  unread: number;
}

export type Subscription<T> = { event: Event<T>; handlers: EventHandler<Event<T>>[] };
export type Subscriptions<T> = Subscription<T>[];

export type ModuleSubscriptions = {
  domain: Subscriptions<unknown>;
};

export type NotificationsModuleCommands = [
  { event: typeof SendNotificationCommandEvent; handlers: CommandHandler<SendNotificationCommandEvent>[] },
  { event: typeof MarkAsReadNotificationCommandEvent; handlers: CommandHandler<MarkAsReadNotificationCommandEvent>[] },
];

export type NotificationsModuleQueries = [
  { name: typeof GetNotificationsQueryHandler.name; handler: GetNotificationsQueryHandler },
];

export type NotificationsModuleDomainEvents = [
  { event: typeof NotificationSentEvent; handlers: EventHandler<NotificationSentEvent>[] },
];

export type NotificationsModuleIntegrationEvents = [
  { event: typeof AccountCreatedIntegrationEvent; handlers: EventHandler<AccountCreatedIntegrationEvent>[] },
  { event: typeof AccountValidatedIntegrationEvent; handlers: EventHandler<AccountValidatedIntegrationEvent>[] },
  { event: typeof OperationCompleteIntegrationEvent; handlers: EventHandler<OperationCompleteIntegrationEvent>[] },
];

export type NotificationsModuleServices = {
  webSocketService: FastifyWebSocketService;
};
