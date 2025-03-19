import { ExecutionContext } from '@SharedKernel/Domain/Application/ExecutionContext';
import { NotificationType } from '../Notification';

export interface NotificationRequest {
  recipientId: string;
  type: NotificationType;
  title: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface INotificationService {
  send(notification: NotificationRequest, context: ExecutionContext): Promise<boolean>;
}
