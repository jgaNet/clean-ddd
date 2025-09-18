import { DomainEvent } from '@Core/Application/EventTypes';
import { NotificationType } from '../Notification';

export class NotificationSentEvent extends DomainEvent<{
  notificationId: string;
  recipientId: string;
  type: NotificationType;
  title: string;
}> {}