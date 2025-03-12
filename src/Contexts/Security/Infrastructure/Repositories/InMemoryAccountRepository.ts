import { DataSource } from '@Primitives';
import { Account } from '@Contexts/Security/Domain/Account/Account';
import { IAccountRepository } from '@Contexts/Security/Domain/Account/Ports/IAccountRepository';
import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';

export class InMemoryAccountRepository implements IAccountRepository {
  dataSource: DataSource<Account>;

  constructor(dataSource: InMemoryDataSource<Account>) {
    this.dataSource = dataSource;
  }

  async save(account: Account): Promise<void> {
    (this.dataSource as InMemoryDataSource<Account>).collection.set(account._id, account);
  }

  async findById(id: string): Promise<Account | null> {
    return (this.dataSource as InMemoryDataSource<Account>).collection.get(id) || null;
  }

  async delete(id: string): Promise<void> {
    (this.dataSource as InMemoryDataSource<Account>).collection.delete(id);
  }
}
