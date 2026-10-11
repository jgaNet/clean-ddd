import { InMemoryDataSource } from '@Architecture/Infrastructure/DataSources/InMemoryDataSource';

import { Account } from '@Contexts/Security/Domain/Account/Account';
import { IAccount } from '@Contexts/Security/Domain/Account/DTOs';
import { IAccountRepository } from '@Contexts/Security/Domain/Account/Ports/IAccountRepository';

export class InMemoryAccountRepository implements IAccountRepository {
  constructor(private dataSource: InMemoryDataSource<IAccount>) {}

  async findById(id: string): Promise<Account | null> {
    const snapshot = this.dataSource.collection.get(id);
    return snapshot ? Account.fromSnapshot(snapshot) : null;
  }

  async findByEmail(email: string): Promise<Account | null> {
    const wanted = email.trim().toLowerCase();
    const snapshot = [...this.dataSource.collection.values()].find(account => account.email === wanted);
    return snapshot ? Account.fromSnapshot(snapshot) : null;
  }

  async save(account: Account): Promise<void> {
    this.dataSource.collection.set(account._id.value, account.toSnapshot());
  }
}
