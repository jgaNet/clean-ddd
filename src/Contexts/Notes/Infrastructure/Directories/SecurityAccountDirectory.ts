import { IAccountQueries } from '@Contexts/Security/Domain/Account/Ports/IAccountQueries';
import { AccountStatus } from '@Contexts/Security/Domain/Account/AccountStatus';
import { AccountPlan as SecurityAccountPlan } from '@Contexts/Security/Domain/Account/AccountPlan';

import { AccountPlan, IAccountDirectory } from '@Contexts/Notes/Domain/Note/Ports/IAccountDirectory';

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

  async planOf(accountId: string): Promise<AccountPlan> {
    const account = await this.accounts.findById(accountId);
    return account ? this.translate(account.plan) : AccountPlan.FREE;
  }

  /** The translation between the two vocabularies, written out so that a new plan on either side is a visible choice here. */
  private translate(plan: SecurityAccountPlan): AccountPlan {
    switch (plan) {
      case SecurityAccountPlan.PRO:
        return AccountPlan.PRO;
      case SecurityAccountPlan.FREE:
        return AccountPlan.FREE;
    }
  }
}
