import { Module } from '@SharedKernel/Application';
import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';

import { ISubscription } from '@Contexts/Billing/Domain/Subscription/DTOs';
import { PlanAssignment } from '@Contexts/Billing/Domain/Subscription/PlanAssignment';
import { SetAccountPlanCommandEvent, SetAccountPlanCommandHandler } from '@Contexts/Billing/Application/Commands';
import { GetAccountPlanQueryHandler } from '@Contexts/Billing/Application/Queries';
import { InMemorySubscriptionRepository } from '@Contexts/Billing/Infrastructure/Repositories/InMemorySubscriptionRepository';
import { InMemorySubscriptionQueries } from '@Contexts/Billing/Infrastructure/Queries/InMemorySubscriptionQueries';
import { SecurityAccountDirectory } from '@Contexts/Billing/Infrastructure/Directories/SecurityAccountDirectory';
import { accountQueries } from '@Contexts/Security/module.local';

// Write side and read side share the same store here; a real deployment may split them.
const subscriptionDataSource = new InMemoryDataSource<ISubscription>();
const subscriptionRepository = new InMemorySubscriptionRepository(subscriptionDataSource);
// Exposed to the wiring of contexts that ask which plan an account is on (Notes, through its own port).
export const subscriptionQueries = new InMemorySubscriptionQueries(subscriptionDataSource);

// Setting a plan needs to know whether the account exists: Billing asks through its own port,
// which the infrastructure answers from Security's read model. Billing never imports Security's domain.
const planAssignment = new PlanAssignment(subscriptionRepository, new SecurityAccountDirectory(accountQueries));

export const localBillingModule = new Module({
  name: 'Billing',
  commands: [
    {
      event: SetAccountPlanCommandEvent,
      handlers: [new SetAccountPlanCommandHandler(subscriptionRepository, planAssignment)],
    },
  ],
  queries: [new GetAccountPlanQueryHandler(subscriptionQueries)],
});
