import { IResult, Result } from '@SharedKernel/Domain';

import { Subscription } from '@Contexts/Billing/Domain/Subscription/Subscription';
import { isPlan } from '@Contexts/Billing/Domain/Subscription/Plan';
import { IAccountDirectory } from '@Contexts/Billing/Domain/Subscription/Ports/IAccountDirectory';
import { ISubscriptionRepository } from '@Contexts/Billing/Domain/Subscription/Ports/ISubscriptionRepository';
import {
  UnknownAccountException,
  UnknownPlanException,
} from '@Contexts/Billing/Domain/Subscription/SubscriptionExceptions';

/**
 * PlanAssignment is a domain service: it holds the rules of putting an account on a plan that
 * the aggregate cannot check alone. "The account must exist" is a fact another context owns,
 * asked through a port Billing owns (IAccountDirectory); "an account has one subscription" is a
 * statement about the whole collection, so it needs the repository. Once those hold, the
 * aggregate applies its own rule (not the plan it is already on). Still domain code: ports
 * only, no transaction, no publishing.
 */
export class PlanAssignment {
  constructor(
    private subscriptions: ISubscriptionRepository,
    private accounts: IAccountDirectory,
  ) {}

  /** The plan arrives as a string from outside the domain; it is checked here so no other entry point can skip it. */
  async assign(accountId: string, plan: string): Promise<IResult<Subscription>> {
    if (!isPlan(plan)) return Result.fail(new UnknownPlanException(plan));

    if (!(await this.accounts.exists(accountId))) {
      return Result.fail(new UnknownAccountException(accountId));
    }

    const subscription = (await this.subscriptions.findByAccountId(accountId)) ?? Subscription.create({ accountId });

    const changed = subscription.changePlan(plan);
    if (changed.isFailure()) return changed;

    return Result.ok(subscription);
  }
}
