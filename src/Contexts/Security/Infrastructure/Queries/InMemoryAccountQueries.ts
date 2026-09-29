import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';

import { IAccount } from '@Contexts/Security/Domain/Account/DTOs';
import { AccountDetail, IAccountQueries } from '@Contexts/Security/Domain/Account/Ports/IAccountQueries';

export class InMemoryAccountQueries implements IAccountQueries {
  constructor(private dataSource: InMemoryDataSource<IAccount>) {}

  async findById(id: string): Promise<AccountDetail | null> {
    const account = this.dataSource.collection.get(id);
    if (!account) return null;

    // The read model deliberately leaves the credentials behind.
    return {
      id: account._id,
      email: account.email,
      role: account.role,
      status: account.status,
      plan: account.plan,
      lastAuthenticatedAt: account.lastAuthenticatedAt,
    };
  }
}
