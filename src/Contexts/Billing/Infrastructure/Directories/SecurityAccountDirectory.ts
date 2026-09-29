import { IAccountQueries } from '@Contexts/Security/Domain/Account/Ports/IAccountQueries';

import { IAccountDirectory } from '@Contexts/Billing/Domain/Subscription/Ports/IAccountDirectory';

/**
 * Billing's view of Security's accounts: an adapter over Security's *read model*, never its
 * aggregate or repository. Only the Billing infrastructure knows the two contexts share a
 * process; the domain and application layers of Billing see IAccountDirectory alone. Any
 * account Security knows, pending or active, can be put on a plan: the plan is about billing,
 * not about signing in.
 */
export class SecurityAccountDirectory implements IAccountDirectory {
  constructor(private accounts: IAccountQueries) {}

  async exists(accountId: string): Promise<boolean> {
    return (await this.accounts.findById(accountId)) !== null;
  }
}
