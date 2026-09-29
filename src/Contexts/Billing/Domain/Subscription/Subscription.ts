import { AggregateRoot, IResult, Result } from '@SharedKernel/Domain';
import { Id } from '@SharedKernel/Domain/ValueObjects';

import { INewSubscription, ISubscription } from '@Contexts/Billing/Domain/Subscription/DTOs';
import { isPlan, Plan } from '@Contexts/Billing/Domain/Subscription/Plan';
import {
  PlanChangedEvent,
  SubscriptionCreatedEvent,
} from '@Contexts/Billing/Domain/Subscription/Events/SubscriptionEvents';
import { AlreadyOnPlanException } from '@Contexts/Billing/Domain/Subscription/SubscriptionExceptions';

/**
 * Subscription is the aggregate root of the Billing context: which plan an account is on.
 *
 * - a subscription belongs to one account and starts on the default plan (FREE)
 * - changing the plan is the only behaviour; moving to the plan it is already on is refused
 * - "one subscription per account" and "the account must exist" are rules about the whole
 *   collection and about another context, so they live in the PlanAssignment domain service
 *
 * An account with no subscription at all is on the default plan too: that is what the queries
 * port answers for it (ISubscriptionQueries), so nothing has to be written for an account
 * until an administrator changes its plan.
 */
export class Subscription extends AggregateRoot {
  /** Where every account starts; the queries port answers it for an account never written. */
  static readonly DEFAULT_PLAN = Plan.FREE;

  #accountId: Id;
  #plan: Plan;

  private constructor(id: Id, accountId: Id, plan: Plan) {
    super(id);
    this.#accountId = accountId;
    this.#plan = plan;
  }

  /**
   * Starts the subscription of an account, on the default plan. Nothing can be invalid here,
   * so unlike Note.create() it returns the aggregate rather than a Result.
   */
  static create(props: INewSubscription): Subscription {
    const id = Id.generate();
    const subscription = new Subscription(id, new Id(props.accountId), Subscription.DEFAULT_PLAN);
    subscription.record(
      SubscriptionCreatedEvent.set({ subscriptionId: id.value, accountId: props.accountId, plan: subscription.#plan }),
    );

    return subscription;
  }

  /** Rebuilds a Subscription from what was persisted. No event is recorded: nothing new happened. */
  static fromSnapshot(snapshot: ISubscription): Subscription {
    if (!isPlan(snapshot.plan)) {
      throw new Error(`Corrupted subscription ${snapshot._id}: unknown plan ${snapshot.plan}`);
    }

    return new Subscription(new Id(snapshot._id), new Id(snapshot.accountId), snapshot.plan);
  }

  changePlan(plan: Plan): IResult {
    if (this.#plan === plan) {
      return Result.fail(new AlreadyOnPlanException(this.#accountId.value, plan));
    }

    const from = this.#plan;
    this.#plan = plan;
    this.record(
      PlanChangedEvent.set({ subscriptionId: this._id.value, accountId: this.#accountId.value, from, to: plan }),
    );

    return Result.ok();
  }

  /** The plain data to persist. `fromSnapshot(subscription.toSnapshot())` gives back an equal subscription. */
  toSnapshot(): ISubscription {
    return { _id: this._id.value, accountId: this.#accountId.value, plan: this.#plan };
  }

  get accountId(): Id {
    return this.#accountId;
  }

  get plan(): Plan {
    return this.#plan;
  }
}
