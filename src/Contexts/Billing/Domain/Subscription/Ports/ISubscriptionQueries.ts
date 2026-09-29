import { Plan } from '@Contexts/Billing/Domain/Subscription/Plan';

/** Read model: the plan an account is on. Plain data for a screen, an API or another context's adapter. */
export interface AccountPlanDetail {
  accountId: string;
  plan: Plan;
}

/**
 * The read side of Billing. It never returns the aggregate.
 */
export interface ISubscriptionQueries {
  /**
   * The plan of any account id you give it. An account with no subscription yet is on the
   * default plan (Subscription.DEFAULT_PLAN), and so is an id Billing has never heard of:
   * whether the account exists is Security's question, not this one.
   */
  planOf(accountId: string): Promise<AccountPlanDetail>;
}
