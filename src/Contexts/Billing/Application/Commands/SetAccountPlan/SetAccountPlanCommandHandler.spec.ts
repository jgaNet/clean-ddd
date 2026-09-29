import { EventEmitter } from 'events';
import { expect } from '@jest/globals';

import { NotAllowedException, Role } from '@SharedKernel/Domain';
import { ExecutionContext, OperationStatus } from '@SharedKernel/Application';
import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';
import { InMemoryEventBus } from '@SharedKernel/Infrastructure/EventBus/InMemoryEventBus';

import { ISubscription } from '@Contexts/Billing/Domain/Subscription/DTOs';
import { Plan } from '@Contexts/Billing/Domain/Subscription/Plan';
import { PlanAssignment } from '@Contexts/Billing/Domain/Subscription/PlanAssignment';
import { UnknownAccountException } from '@Contexts/Billing/Domain/Subscription/SubscriptionExceptions';
import { InMemorySubscriptionRepository } from '@Contexts/Billing/Infrastructure/Repositories/InMemorySubscriptionRepository';
import { SetAccountPlanCommandEvent, SetAccountPlanCommandHandler } from '@Contexts/Billing/Application/Commands';

// The role rule is in guard(), which only handle() runs: the spec goes through an operation, as the bus would.
const eventBus = new InMemoryEventBus({ eventEmitter: new EventEmitter() });
const setPlan = (handler: SetAccountPlanCommandHandler, role: Role, accountId = 'alice', plan = 'PRO') => {
  const context = new ExecutionContext({ traceId: 'trace', eventBus, auth: { subjectId: 'caller', role } });
  return handler.handle(eventBus.publish(SetAccountPlanCommandEvent.set({ accountId, plan }), context));
};

let store: InMemoryDataSource<ISubscription>;
let handler: SetAccountPlanCommandHandler;

beforeEach(() => {
  store = new InMemoryDataSource<ISubscription>();
  const repository = new InMemorySubscriptionRepository(store);
  // Every account the tests talk about exists; the directory itself is covered by PlanAssignment.spec.
  const accounts = { exists: async (id: string) => ['alice', 'bob'].includes(id) };
  handler = new SetAccountPlanCommandHandler(repository, new PlanAssignment(repository, accounts));
});

describe('SetAccountPlanCommandHandler', () => {
  it('lets an administrator put an account on a plan', async () => {
    const operation = await setPlan(handler, Role.ADMIN);

    expect(operation.status).toBe(OperationStatus.SUCCESS);
    const subscriptionId = operation.result?.data as string;
    expect(store.collection.get(subscriptionId)).toEqual({ _id: subscriptionId, accountId: 'alice', plan: Plan.PRO });
  });

  it('refuses anyone else before touching the store', async () => {
    for (const role of [Role.USER, Role.GUEST]) {
      const operation = await setPlan(handler, role);

      expect(operation.status).toBe(OperationStatus.ERROR);
      expect(operation.result?.error).toBeInstanceOf(NotAllowedException);
    }
    expect(store.collection.size).toBe(0);
  });

  it('refuses an account that does not exist and saves nothing', async () => {
    const operation = await setPlan(handler, Role.ADMIN, 'mallory');

    expect(operation.status).toBe(OperationStatus.ERROR);
    expect(operation.result?.error).toBeInstanceOf(UnknownAccountException);
    expect(store.collection.size).toBe(0);
  });
});
