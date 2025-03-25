import { NotificationStatus, NotificationType } from './Notification';

export interface INotification {
  _id: string;
  recipientId: string;
  type: NotificationType;
  title: string;
  content: string;
  status: NotificationStatus;
  createdAt: Date;
  sentAt?: Date | null;
  readAt?: Date | null;
  metadata?: Record<string, unknown>;
}
