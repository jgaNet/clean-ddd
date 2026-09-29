import { EventEmitter } from 'events';
import { expect, jest } from '@jest/globals';

import { Role } from '@SharedKernel/Domain';
import { EventBus, ExecutionContext, OperationStatus } from '@SharedKernel/Application';
import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';
import { InMemoryEventBus } from '@SharedKernel/Infrastructure/EventBus/InMemoryEventBus';

import { Account } from '@Contexts/Security/Domain/Account/Account';
import { IAccount } from '@Contexts/Security/Domain/Account/DTOs';
import { AccountPlan } from '@Contexts/Security/Domain/Account/AccountPlan';
import { AccountPlanChangedEvent } from '@Contexts/Security/Domain/Account/Events/AccountEvents';
import { InMemoryAccountRepository } from '@Contexts/Security/Infrastructure/Repositories/InMemoryAccountRepository';
import { ChangeAccountPlanCommandEvent } from './ChangeAccountPlanCommandEvent';
import { ChangeAccountPlanCommandHandler } from './ChangeAccountPlanCommandHandler';

const eventBus = { connect: jest.fn(), publish: jest.fn(), subscribe: jest.fn() } as EventBus;
const contextFor = (role: Role, subjectId = '') =>
  new ExecutionContext({ traceId: 'trace', eventBus, auth: { subjectId, role } });

// The guard runs in handle(), which takes an operation: the in-memory bus builds one for us.
const operationFor = (payload: ChangeAccountPlanCommandEvent['payload'], role: Role) =>
  new InMemoryEventBus({ eventEmitter: new EventEmitter() }).publish(
    ChangeAccountPlanCommandEvent.set(payload),
    contextFor(role, role === Role.ADMIN ? 'root' : 'someone'),
  );

let store: InMemoryDataSource<IAccount>;
let handler: ChangeAccountPlanCommandHandler;
let accountId: string;

beforeEach(async () => {
  jest.resetAllMocks();
  store = new InMemoryDataSource<IAccount>();
  const repository = new InMemoryAccountRepository(store);
  handler = new ChangeAccountPlanCommandHandler(repository);

  const account = Account.register({ email: 'eve@example.com', role: Role.USER, passwordHash: 'h', activated: true });
  await repository.save(account.data as Account);
  accountId = (account.data as Account)._id.value;
});

describe('ChangeAccountPlanCommandHandler', () => {
  it('lets an administrator put an account on the pro plan and publishes AccountPlanChanged', async () => {
    const done = await handler.handle(operationFor({ accountId, plan: AccountPlan.PRO }, Role.ADMIN));

    expect(done.status).toBe(OperationStatus.SUCCESS);
    expect(store.collection.get(accountId)?.plan).toBe(AccountPlan.PRO);
    expect(eventBus.publish).toHaveBeenCalledWith(
      AccountPlanChangedEvent.set({ accountId, plan: AccountPlan.PRO }),
      expect.any(ExecutionContext),
    );
  });

  it('refuses anyone who is not an administrator, at the guard', async () => {
    for (const role of [Role.GUEST, Role.USER]) {
      const done = await handler.handle(operationFor({ accountId, plan: AccountPlan.PRO }, role));

      expect(done.status).toBe(OperationStatus.ERROR);
      expect(done.result?.error?.type).toBe('NotAllowed');
    }
    expect(store.collection.get(accountId)?.plan).toBe(AccountPlan.FREE);
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('refuses the plan the account is already on', async () => {
    const done = await handler.handle(operationFor({ accountId, plan: AccountPlan.FREE }, Role.ADMIN));

    expect(done.status).toBe(OperationStatus.ERROR);
    expect(done.result?.error?.type).toBe('AccountAlreadyOnPlan');
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('fails on an unknown account', async () => {
    const done = await handler.handle(operationFor({ accountId: 'nobody', plan: AccountPlan.PRO }, Role.ADMIN));

    expect(done.status).toBe(OperationStatus.ERROR);
    expect(done.result?.error?.type).toBe('AccountNotFound');
  });
});
