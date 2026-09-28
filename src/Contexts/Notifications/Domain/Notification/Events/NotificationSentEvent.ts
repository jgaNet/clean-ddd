import { DomainEvent } from '@SharedKernel/Domain/DDD/EventTypes';
import { NotificationType } from '../Notification';

export class NotificationSentEvent extends DomainEvent<{
  notificationId: string;
  recipientId: string;
  type: NotificationType;
  title: string;
}> {}
