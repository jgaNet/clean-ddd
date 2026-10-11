import { Channel } from '@Contexts/Notifications/Domain/Notification/Channel';
import { NotificationStatus } from '@Contexts/Notifications/Domain/Notification/NotificationStatus';

/** What an inbox shows. The attempts stay inside the aggregate. */
export interface NotificationListItem {
  id: string;
  recipientId: string;
  title: string;
  content: string;
  status: NotificationStatus;
  channels: Channel[];
  deliveredVia?: Channel;
  createdAt: Date;
  sentAt?: Date;
  readAt?: Date;
  metadata: Record<string, unknown>;
}

export interface InboxFilters {
  limit?: number;
  offset?: number;
  onlyUnread?: boolean;
}

export interface INotificationQueries {
  findByRecipient(recipientId: string, filters?: InboxFilters): Promise<NotificationListItem[]>;
  countByRecipient(recipientId: string, onlyUnread?: boolean): Promise<number>;
}
