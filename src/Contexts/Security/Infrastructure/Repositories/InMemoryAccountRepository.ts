import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';

import { Account } from '@Contexts/Security/Domain/Account/Account';
import { IAccountRepository } from '@Contexts/Security/Domain/Account/Ports/IAccountRepository';

export class InMemoryAccountRepository implements IAccountRepository {
  constructor(private dataSource: InMemoryDataSource<Account>) {}

  async save(account: Account): Promise<void> {
    this.dataSource.collection.set(account._id.value, account);
  }

  async findByIdentifier(identifier: string): Promise<Account | null> {
    const accounts = Array.from(this.dataSource.collection.values());
    const account = accounts.find(
      account =>
        account.subjectId === identifier ||
        (account.credentials.metadata && account.credentials.metadata.email === identifier),
    );
    return account || null;
  }

  async findById(id: string): Promise<Account | null> {
    return this.dataSource.collection.get(id) || null;
  }

  async delete(subjectId: string): Promise<void> {
    this.dataSource.collection.delete(subjectId);
  }
}
