import { Notification } from '@Contexts/Notifications/Domain/Notification/Notification';

export interface INotificationRepository {
  findById(id: string): Promise<Notification | null>;
  save(notification: Notification): Promise<void>;
}
