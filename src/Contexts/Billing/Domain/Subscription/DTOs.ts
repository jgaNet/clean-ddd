import { Plan } from '@Contexts/Billing/Domain/Subscription/Plan';

/**
 * Snapshot of a Subscription: the plain data the aggregate is persisted as and rebuilt from.
 * It is the only shape that crosses the domain boundary towards the infrastructure.
 */
export interface ISubscription {
  _id: string;
  accountId: string;
  plan: Plan;
}

/** What is needed to start a subscription: the account it belongs to. The plan is the default. */
export type INewSubscription = Pick<ISubscription, 'accountId'>;
