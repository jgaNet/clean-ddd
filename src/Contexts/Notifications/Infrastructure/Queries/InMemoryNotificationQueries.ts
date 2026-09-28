import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';

import { INotification } from '@Contexts/Notifications/Domain/Notification/DTOs';
import { NotificationStatus } from '@Contexts/Notifications/Domain/Notification/NotificationStatus';
import {
  InboxFilters,
  INotificationQueries,
  NotificationListItem,
} from '@Contexts/Notifications/Domain/Notification/Ports/INotificationQueries';

export class InMemoryNotificationQueries implements INotificationQueries {
  constructor(private dataSource: InMemoryDataSource<INotification>) {}

  async findByRecipient(recipientId: string, { limit = 20, offset = 0, onlyUnread = false }: InboxFilters = {}) {
    return this.inbox(recipientId, onlyUnread)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(offset, offset + limit)
      .map(toListItem);
  }

  async countByRecipient(recipientId: string, onlyUnread = false): Promise<number> {
    return this.inbox(recipientId, onlyUnread).length;
  }

  private inbox(recipientId: string, onlyUnread: boolean): INotification[] {
    return [...this.dataSource.collection.values()].filter(
      n => n.recipientId === recipientId && (!onlyUnread || n.status === NotificationStatus.SENT),
    );
  }
}

function toListItem(n: INotification): NotificationListItem {
  return {
    id: n._id,
    recipientId: n.recipientId,
    title: n.title,
    content: n.content,
    status: n.status,
    channels: n.channels,
    deliveredVia: n.deliveredVia,
    createdAt: n.createdAt,
    sentAt: n.sentAt,
    readAt: n.readAt,
    metadata: n.metadata,
  };
}
