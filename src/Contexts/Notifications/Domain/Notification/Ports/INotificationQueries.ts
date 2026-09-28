import { INotification } from '../DTOs';

export interface INotificationQueries {
  findAll(options?: {
    recipientId?: string;
    limit?: number;
    offset?: number;
    onlyUnread?: boolean;
  }): Promise<INotification[]>;

  findById(id: string): Promise<INotification | null>;

  count(recipientId?: string, onlyUnread?: boolean): Promise<number>;
}
