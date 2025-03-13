import { IAccountQueries } from '@Contexts/Security/Domain/Account/Ports/IAccountQueries';
import { IAccount } from '@Contexts/Security/Domain/Account/DTOs';
import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';
import { Account } from '@Contexts/Security/Domain/Account/Account';
import { AccountMapper } from '@Contexts/Security/Domain/Account/AccountMapper';

export class InMemoryAccountQueries implements IAccountQueries {
  dataSource: InMemoryDataSource<Account>;
  private mapper: AccountMapper;

  constructor(dataSource: InMemoryDataSource<Account>) {
    this.dataSource = dataSource;
    this.mapper = new AccountMapper();
  }

  async findBySubject(subjectId: string, subjectType: string): Promise<IAccount | null> {
    const accounts = Array.from(this.dataSource.collection.values());
    const account = accounts.find(account => account.subjectId === subjectId && account.subjectType === subjectType);
    return account ? this.mapper.toJSON(account) : null;
  }

  async findByIdentifier(identifier: string): Promise<IAccount | null> {
    // In a real implementation, this would search by email, username or any other identifier
    // In this in-memory implementation, we'll assume the identifier is the subjectId
    const accounts = Array.from(this.dataSource.collection.values());
    const account = accounts.find(
      account =>
        account.subjectId === identifier ||
        (account.credentials.metadata && account.credentials.metadata.email === identifier),
    );
    return account ? this.mapper.toJSON(account) : null;
  }

  async findById(id: string): Promise<IAccount | null> {
    const account = this.dataSource.collection.get(id);
    return account ? this.mapper.toJSON(account) : null;
  }

  async findAll(options?: { limit?: number; offset?: number }): Promise<IAccount[]> {
    const { limit = 10, offset = 0 } = options || {};
    const accounts = Array.from(this.dataSource.collection.values());
    return accounts.slice(offset, offset + limit).map(account => this.mapper.toJSON(account));
  }

  async findByCredentialType(type: string, options?: { limit?: number; offset?: number }): Promise<IAccount[]> {
    const { limit = 10, offset = 0 } = options || {};
    const accounts = Array.from(this.dataSource.collection.values());
    return accounts
      .filter(account => account.credentials.type === type)
      .slice(offset, offset + limit)
      .map(account => this.mapper.toJSON(account));
  }

  async count(): Promise<number> {
    return this.dataSource.collection.size;
  }
}
