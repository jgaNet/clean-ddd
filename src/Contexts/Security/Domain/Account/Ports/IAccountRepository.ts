import { Repository } from '@Primitives';
import { IAccount } from '../DTOs';
import { Account } from '../Account';

export interface IAccountRepository extends Repository<IAccount> {
  save(account: IAccount): Promise<void>;
  findById(id: string): Promise<Account | null>;
  delete(id: string): Promise<void>;
}
