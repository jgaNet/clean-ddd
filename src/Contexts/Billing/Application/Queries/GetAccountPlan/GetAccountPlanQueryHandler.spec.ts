import { expect, jest } from '@jest/globals';

import { NotAllowedException, Role } from '@SharedKernel/Domain';
import { EventBus, ExecutionContext } from '@SharedKernel/Application';
import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';

import { ISubscription } from '@Contexts/Billing/Domain/Subscription/DTOs';
import { Plan } from '@Contexts/Billing/Domain/Subscription/Plan';
import { InMemorySubscriptionQueries } from '@Contexts/Billing/Infrastructure/Queries/InMemorySubscriptionQueries';
import { GetAccountPlanQueryHandler } from '@Contexts/Billing/Application/Queries';

const eventBus = { connect: jest.fn(), publish: jest.fn(), subscribe: jest.fn() } as EventBus;
const contextFor = (role: Role, subjectId?: string) =>
  new ExecutionContext({ traceId: 'trace', eventBus, auth: { subjectId, role } });

let handler: GetAccountPlanQueryHandler;

beforeEach(() => {
  const store = new InMemoryDataSource<ISubscription>();
  store.collection.set('s-bob', { _id: 's-bob', accountId: 'bob', plan: Plan.PRO });
  handler = new GetAccountPlanQueryHandler(new InMemorySubscriptionQueries(store));
});

describe('GetAccountPlanQueryHandler', () => {
  it('lets an administrator read the plan of any account, the default one included', async () => {
    expect((await handler.handle('bob', contextFor(Role.ADMIN, 'root'))).data).toEqual({
      accountId: 'bob',
      plan: Plan.PRO,
    });
    expect((await handler.handle('alice', contextFor(Role.ADMIN, 'root'))).data).toEqual({
      accountId: 'alice',
      plan: Plan.FREE,
    });
  });

  it('lets an account read its own plan', async () => {
    const result = await handler.handle('bob', contextFor(Role.USER, 'bob'));

    expect(result.data).toEqual({ accountId: 'bob', plan: Plan.PRO });
  });

  it("refuses a user asking for someone else's plan, and any anonymous caller", async () => {
    expect((await handler.handle('bob', contextFor(Role.USER, 'alice'))).error).toBeInstanceOf(NotAllowedException);
    expect((await handler.handle('bob', contextFor(Role.GUEST))).error).toBeInstanceOf(NotAllowedException);
  });
});
