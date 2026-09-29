import { Subscription } from '@Contexts/Billing/Domain/Subscription/Subscription';

/**
 * Write side of persistence: loads and saves the Subscription aggregate. `findByAccountId` is
 * here, not in the queries, because the domain itself needs it (PlanAssignment: an account has
 * at most one subscription) and the result is an aggregate, not a read model.
 */
export interface ISubscriptionRepository {
  findById(id: string): Promise<Subscription | null>;
  findByAccountId(accountId: string): Promise<Subscription | null>;
  save(subscription: Subscription): Promise<void>;
}
