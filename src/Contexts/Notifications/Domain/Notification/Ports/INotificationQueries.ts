import { INotification } from '../DTOs';
import { QueriesService } from '@SharedKernel/Domain/DDD/QueriesService';

export interface INotificationQueries extends QueriesService {
  findAll(options?: {
    recipientId?: string;
    limit?: number;
    offset?: number;
    onlyUnread?: boolean;
  }): Promise<INotification[]>;

  findById(id: string): Promise<INotification | null>;

  count(recipientId?: string, onlyUnread?: boolean): Promise<number>;
}
