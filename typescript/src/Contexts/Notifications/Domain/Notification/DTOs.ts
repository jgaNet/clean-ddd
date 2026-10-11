import { Channel } from '@Contexts/Notifications/Domain/Notification/Channel';
import { NotificationStatus } from '@Contexts/Notifications/Domain/Notification/NotificationStatus';

export interface IDeliveryAttempt {
  _id: string;
  channel: Channel;
  at: Date;
  succeeded: boolean;
}

/** Snapshot of a Notification, attempts included: the aggregate is persisted as a whole. */
export interface INotification {
  _id: string;
  recipientId: string;
  title: string;
  content: string;
  channels: Channel[];
  status: NotificationStatus;
  createdAt: Date;
  sentAt?: Date;
  readAt?: Date;
  deliveredVia?: Channel;
  metadata: Record<string, unknown>;
  attempts: IDeliveryAttempt[];
}

/** What is needed to send a new notification. */
export interface INewNotification {
  recipientId: string;
  title: string;
  content: string;
  channels: Channel[];
  /** Whatever a channel may need that is not the notification itself (an email address, a source). */
  metadata?: Record<string, unknown>;
}
