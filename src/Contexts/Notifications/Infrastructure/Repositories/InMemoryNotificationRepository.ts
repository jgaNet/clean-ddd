import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';
import { v4 as uuidv4 } from 'uuid';
import { INotificationRepository } from '@Contexts/Notifications/Domain/Notification/Ports/INotificationRepository';
import { Notification } from '@Contexts/Notifications/Domain/Notification/Notification';
import { Nullable } from '@SharedKernel/Domain/Utils/Nullable';
import { NotificationMapper } from '@Contexts/Notifications/Domain/Notification/NotificationMapper';
import { INotification } from '@Contexts/Notifications/Domain/Notification/DTOs';

export class InMemoryNotificationRepository implements INotificationRepository {
  private notificationMapper = new NotificationMapper();

  constructor(private dataSource: InMemoryDataSource<INotification>) {}

  async nextIdentity(): Promise<string> {
    return uuidv4();
  }

  async save(notification: Notification): Promise<void> {
    const dto = this.notificationMapper.toJSON(notification);
    this.dataSource.collection.set(dto._id, dto);
  }

  async findById(id: string): Promise<Nullable<Notification>> {
    const dto = this.dataSource.collection.get(id);
    if (!dto) return null;

    return this.notificationMapper.toEntity(dto);
  }

  async markAsRead(id: string): Promise<boolean> {
    const notification = await this.findById(id);
    if (!notification) return false;

    notification.markAsRead();
    await this.save(notification);

    return true;
  }
}
