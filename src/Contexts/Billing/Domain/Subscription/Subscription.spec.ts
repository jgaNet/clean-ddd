import { Plan } from '@Contexts/Billing/Domain/Subscription/Plan';
import { Subscription } from '@Contexts/Billing/Domain/Subscription/Subscription';
import {
  PlanChangedEvent,
  SubscriptionCreatedEvent,
} from '@Contexts/Billing/Domain/Subscription/Events/SubscriptionEvents';
import { AlreadyOnPlanException } from '@Contexts/Billing/Domain/Subscription/SubscriptionExceptions';

function aSubscription(): Subscription {
  const subscription = Subscription.create({ accountId: 'alice' });
  subscription.pullDomainEvents();
  return subscription;
}

describe('Subscription', () => {
  describe('starting', () => {
    it('picks its own identity, starts on the free plan and records SubscriptionCreated', () => {
      const subscription = Subscription.create({ accountId: 'alice' });

      expect(subscription._id.value).toEqual(expect.any(String));
      expect(subscription.accountId.value).toBe('alice');
      expect(subscription.plan).toBe(Plan.FREE);
      expect(subscription.pullDomainEvents()).toEqual([
        SubscriptionCreatedEvent.set({ subscriptionId: subscription._id.value, accountId: 'alice', plan: Plan.FREE }),
      ]);
    });
  });

  describe('changing plan', () => {
    it('moves to another plan and records PlanChanged', () => {
      const subscription = aSubscription();

      expect(subscription.changePlan(Plan.PRO).isSuccess()).toBe(true);
      expect(subscription.plan).toBe(Plan.PRO);
      expect(subscription.pullDomainEvents()).toEqual([
        PlanChangedEvent.set({
          subscriptionId: subscription._id.value,
          accountId: 'alice',
          from: Plan.FREE,
          to: Plan.PRO,
        }),
      ]);
    });

    it('refuses the plan it is already on', () => {
      const subscription = aSubscription();

      expect(subscription.changePlan(Plan.FREE).error).toBeInstanceOf(AlreadyOnPlanException);
      expect(subscription.pullDomainEvents()).toEqual([]);
    });

    it('can come back to the free plan', () => {
      const subscription = aSubscription();
      subscription.changePlan(Plan.PRO);

      expect(subscription.changePlan(Plan.FREE).isSuccess()).toBe(true);
      expect(subscription.plan).toBe(Plan.FREE);
    });
  });

  describe('persistence round-trip', () => {
    it('gives back an equal subscription after toSnapshot / fromSnapshot, without events', () => {
      const subscription = aSubscription();
      subscription.changePlan(Plan.PRO);

      const rebuilt = Subscription.fromSnapshot(subscription.toSnapshot());

      expect(rebuilt.equals(subscription)).toBe(true);
      expect(rebuilt.toSnapshot()).toEqual(subscription.toSnapshot());
      expect(rebuilt.pullDomainEvents()).toEqual([]);
    });

    it('refuses a corrupted snapshot', () => {
      expect(() => Subscription.fromSnapshot({ _id: 's', accountId: 'alice', plan: 'GOLD' as Plan })).toThrow(
        /Corrupted subscription s/,
      );
    });
  });
});
