import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';

import { ISubscription } from '@Contexts/Billing/Domain/Subscription/DTOs';
import { Subscription } from '@Contexts/Billing/Domain/Subscription/Subscription';
import {
  AccountPlanDetail,
  ISubscriptionQueries,
} from '@Contexts/Billing/Domain/Subscription/Ports/ISubscriptionQueries';

export class InMemorySubscriptionQueries implements ISubscriptionQueries {
  constructor(private dataSource: InMemoryDataSource<ISubscription>) {}

  async planOf(accountId: string): Promise<AccountPlanDetail> {
    const subscription = [...this.dataSource.collection.values()].find(s => s.accountId === accountId);

    // No subscription written yet means the account was never moved off the default plan.
    return { accountId, plan: subscription?.plan ?? Subscription.DEFAULT_PLAN };
  }
}
