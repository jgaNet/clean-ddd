import { ExecutionContext, IResult } from '@SharedKernel/Domain/Application';
import { Notification, NotificationType } from '../Notification';
import { DeliveryStrategy } from '../DeliveryStrategy';

export interface NotificationRequest {
  recipientId: string;
  type: NotificationType;
  title: string;
  content: string;
  deliveryStrategy: DeliveryStrategy;
  metadata?: Record<string, unknown>;
}

export interface INotificationService {
  /**
   * Send a notification using the delivery strategy
   */
  send(notification: NotificationRequest, context: ExecutionContext): Promise<boolean>;
  
  /**
   * Send a notification using a specific channel
   */
  sendViaChannel(notification: Notification, type: NotificationType, context: ExecutionContext): Promise<IResult<void>>;
  
  /**
   * Check if a specific notification channel is available for a recipient
   */
  isChannelAvailable(recipientId: string, type: NotificationType): Promise<boolean>;
}