import { NotificationStatus, NotificationType } from '../Domain/Notification/Notification';

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
