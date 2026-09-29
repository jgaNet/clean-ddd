import { Plan } from '@Contexts/Billing/Domain/Subscription/Plan';
import { PlanAssignment } from '@Contexts/Billing/Domain/Subscription/PlanAssignment';
import { Subscription } from '@Contexts/Billing/Domain/Subscription/Subscription';
import { IAccountDirectory } from '@Contexts/Billing/Domain/Subscription/Ports/IAccountDirectory';
import { ISubscriptionRepository } from '@Contexts/Billing/Domain/Subscription/Ports/ISubscriptionRepository';
import {
  AlreadyOnPlanException,
  UnknownAccountException,
  UnknownPlanException,
} from '@Contexts/Billing/Domain/Subscription/SubscriptionExceptions';

/** A domain test needs only the ports: a Map is enough of a repository, a list of ids enough of a directory. */
class FakeSubscriptionRepository implements ISubscriptionRepository {
  #subscriptions = new Map<string, Subscription>();

  async findById(id: string) {
    return this.#subscriptions.get(id) ?? null;
  }
  async findByAccountId(accountId: string) {
    return [...this.#subscriptions.values()].find(s => s.accountId.value === accountId) ?? null;
  }
  async save(subscription: Subscription) {
    this.#subscriptions.set(subscription._id.value, subscription);
  }
  get size() {
    return this.#subscriptions.size;
  }
}

const directoryOf = (...ids: string[]): IAccountDirectory => ({ exists: async id => ids.includes(id) });

describe('PlanAssignment (domain service)', () => {
  let repository: FakeSubscriptionRepository;
  let assignment: PlanAssignment;

  beforeEach(() => {
    repository = new FakeSubscriptionRepository();
    assignment = new PlanAssignment(repository, directoryOf('alice'));
  });

  it('starts the subscription of an account that has none and puts it on the plan', async () => {
    const result = await assignment.assign('alice', 'PRO');

    expect(result.isSuccess()).toBe(true);
    expect(result.data?.accountId.value).toBe('alice');
    expect(result.data?.plan).toBe(Plan.PRO);
  });

  it('changes the plan of the subscription the account already has, rather than starting a second one', async () => {
    const first = await assignment.assign('alice', 'PRO');
    await repository.save(first.data as Subscription);

    const second = await assignment.assign('alice', 'FREE');

    expect(second.isSuccess()).toBe(true);
    expect(second.data?._id.value).toBe(first.data?._id.value);
    expect(second.data?.plan).toBe(Plan.FREE);
  });

  it('refuses an account the directory does not know, before anything is started', async () => {
    const result = await assignment.assign('mallory', 'PRO');

    expect(result.error).toBeInstanceOf(UnknownAccountException);
  });

  it('refuses a plan that does not exist', async () => {
    const result = await assignment.assign('alice', 'GOLD');

    expect(result.error).toBeInstanceOf(UnknownPlanException);
  });

  it("still leaves the subscription's own rules to the aggregate", async () => {
    const result = await assignment.assign('alice', 'FREE');

    expect(result.error).toBeInstanceOf(AlreadyOnPlanException);
  });
});
