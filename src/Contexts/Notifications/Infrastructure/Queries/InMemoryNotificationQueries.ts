import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';
import { INotificationQueries } from '@Contexts/Notifications/Domain/Notification/Ports/INotificationQueries';
import { INotification } from '@Contexts/Notifications/Domain/Notification/DTOs';
import { NotificationStatus } from '@Contexts/Notifications/Domain/Notification/Notification';

export class InMemoryNotificationQueries implements INotificationQueries {
  dataSource: InMemoryDataSource<INotification>;

  constructor(dataSource: InMemoryDataSource<INotification>) {
    this.dataSource = dataSource;
  }

  async findAll(options?: {
    recipientId?: string;
    limit?: number;
    offset?: number;
    onlyUnread?: boolean;
  }): Promise<INotification[]> {
    const { recipientId, limit = 20, offset = 0, onlyUnread = false } = options || {};

    let result = Array.from(this.dataSource.collection.values());

    // Apply filters
    if (recipientId) {
      result = result.filter(n => n.recipientId === recipientId);
    }

    if (onlyUnread) {
      result = result.filter(n => n.status === NotificationStatus.SENT);
    }

    // Sort by creation date, newest first
    result.sort((a, b) => {
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

    // Apply pagination
    return result.slice(offset, offset + limit);
  }

  async findById(id: string): Promise<INotification | null> {
    return this.dataSource.collection.get(id) || null;
  }

  async count(recipientId?: string, onlyUnread: boolean = false): Promise<number> {
    let count = 0;

    for (const notification of this.dataSource.collection.values()) {
      if (recipientId && notification.recipientId !== recipientId) continue;

      if (onlyUnread && notification.status !== NotificationStatus.SENT) continue;

      count++;
    }

    return count;
  }
}
