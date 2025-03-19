import { Notification } from '../Notification';
import { Nullable } from '@SharedKernel/Domain/Utils/Nullable';

export interface INotificationRepository {
  nextIdentity(): Promise<string>;
  save(notification: Notification): Promise<void>;
  findById(id: string): Promise<Nullable<Notification>>;
  markAsRead(id: string): Promise<boolean>;
}