import { Notification } from '../Notification';
import { Nullable } from '@SystemOrchestrator/Helpers';

export interface INotificationRepository {
  nextIdentity(): Promise<string>;
  save(notification: Notification): Promise<void>;
  findById(id: string): Promise<Nullable<Notification>>;
  markAsRead(id: string): Promise<boolean>;
}
