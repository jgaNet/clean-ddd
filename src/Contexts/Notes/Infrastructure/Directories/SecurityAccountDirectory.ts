import { IAccountQueries } from '@Contexts/Security/Domain/Account/Ports/IAccountQueries';
import { AccountStatus } from '@Contexts/Security/Domain/Account/AccountStatus';

import { IAccountDirectory } from '@Contexts/Notes/Domain/Note/Ports/IAccountDirectory';

/**
 * Notes' view of Security's accounts: an adapter over Security's *read model*, never its
 * aggregate or repository. Only the Notes infrastructure knows the two contexts are in the
 * same process; the domain and application layers of Notes see IAccountDirectory alone.
 * In separate deployments this file would call Security's API and nothing above it would change.
 */
export class SecurityAccountDirectory implements IAccountDirectory {
  constructor(private accounts: IAccountQueries) {}

  async exists(accountId: string): Promise<boolean> {
    const account = await this.accounts.findById(accountId);
    return account?.status === AccountStatus.ACTIVE;
  }
}
