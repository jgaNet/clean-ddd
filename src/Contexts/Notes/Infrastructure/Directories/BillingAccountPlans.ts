import { ISubscriptionQueries } from '@Contexts/Billing/Domain/Subscription/Ports/ISubscriptionQueries';
import { Plan } from '@Contexts/Billing/Domain/Subscription/Plan';

import { AccountPlan, IAccountPlans } from '@Contexts/Notes/Domain/Note/Ports/IAccountPlans';

/**
 * Notes' view of Billing's plans: an adapter over Billing's *read model*, never its aggregate
 * or repository. Only the Notes infrastructure knows the two contexts share a process; the
 * domain and application layers of Notes see IAccountPlans alone. The switch is written out on
 * purpose: Billing's Plan and Notes' AccountPlan are two enums that happen to agree today, and
 * a value added to one must be translated here, not assumed.
 */
export class BillingAccountPlans implements IAccountPlans {
  constructor(private subscriptions: ISubscriptionQueries) {}

  async planOf(accountId: string): Promise<AccountPlan> {
    const { plan } = await this.subscriptions.planOf(accountId);

    switch (plan) {
      case Plan.FREE:
        return AccountPlan.FREE;
      case Plan.PRO:
        return AccountPlan.PRO;
    }
  }
}
