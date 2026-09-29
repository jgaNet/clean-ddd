import { DomainEvent } from '@SharedKernel/Domain';

import { Plan } from '@Contexts/Billing/Domain/Subscription/Plan';

/**
 * Facts raised by the Subscription aggregate. They stay inside the Billing context and have no
 * handler today: they are recorded because they happened (the Tracker keeps them), and a
 * reaction can be subscribed later without touching the aggregate. No integration event exists
 * yet because no other context reacts to a plan change: Notes asks for the plan when it needs it.
 */

export class SubscriptionCreatedEvent extends DomainEvent<{ subscriptionId: string; accountId: string; plan: Plan }> {}

export class PlanChangedEvent extends DomainEvent<{
  subscriptionId: string;
  accountId: string;
  from: Plan;
  to: Plan;
}> {}
