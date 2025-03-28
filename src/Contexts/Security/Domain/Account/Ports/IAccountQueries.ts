import { QueriesService } from '@SharedKernel/Domain/DDD';
import { IAccount } from '../DTOs';

export interface IAccountQueries extends QueriesService {
  findById(id: string): Promise<IAccount | null>;
  findByIdentifier(identifier: string): Promise<IAccount | null>;
  findAll(options?: { limit?: number; offset?: number }): Promise<IAccount[]>;
  findByCredentialType(type: string, options?: { limit?: number; offset?: number }): Promise<IAccount[]>;
  count(): Promise<number>;
}
