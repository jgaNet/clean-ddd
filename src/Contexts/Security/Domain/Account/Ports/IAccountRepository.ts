import { Repository } from '@SharedKernel/Domain/DDD';
import { Account } from '../Account';

export interface IAccountRepository extends Repository<Account> {
  save(account: Account): Promise<void>;
  findById(id: string): Promise<Account | null>;
  findByIdentifier(identifier: string): Promise<Account | null>;
  delete(id: string): Promise<void>;
}
