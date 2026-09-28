import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';

import { Notification } from '@Contexts/Notifications/Domain/Notification/Notification';
import { INotification } from '@Contexts/Notifications/Domain/Notification/DTOs';
import { INotificationRepository } from '@Contexts/Notifications/Domain/Notification/Ports/INotificationRepository';

export class InMemoryNotificationRepository implements INotificationRepository {
  constructor(private dataSource: InMemoryDataSource<INotification>) {}

  async findById(id: string): Promise<Notification | null> {
    const snapshot = this.dataSource.collection.get(id);
    return snapshot ? Notification.fromSnapshot(snapshot) : null;
  }

  async save(notification: Notification): Promise<void> {
    this.dataSource.collection.set(notification._id.value, notification.toSnapshot());
  }
}
