import { EventEmitter } from 'events';
import { expect, jest } from '@jest/globals';

import { Role } from '@SharedKernel/Domain';
import { EventBus, ExecutionContext, OperationStatus } from '@SharedKernel/Application';
import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';
import { InMemoryEventBus } from '@SharedKernel/Infrastructure/EventBus/InMemoryEventBus';

import { Account } from '@Contexts/Security/Domain/Account/Account';
import { IAccount } from '@Contexts/Security/Domain/Account/DTOs';
import { AccountStatus } from '@Contexts/Security/Domain/Account/AccountStatus';
import { AccountUnlockedEvent } from '@Contexts/Security/Domain/Account/Events/AccountEvents';
import { InMemoryAccountRepository } from '@Contexts/Security/Infrastructure/Repositories/InMemoryAccountRepository';
import { UnlockAccountCommandEvent } from './UnlockAccountCommandEvent';
import { UnlockAccountCommandHandler } from './UnlockAccountCommandHandler';

const eventBus = { connect: jest.fn(), publish: jest.fn(), subscribe: jest.fn() } as EventBus;

// The guard runs in `handle()`, which takes an Operation; the in-memory bus builds one for us.
const operationFor = (accountId: string, role: Role, subjectId = 'someone') => {
  const context = new ExecutionContext({ traceId: 'trace', eventBus, auth: { subjectId, role } });
  return new InMemoryEventBus({ eventEmitter: new EventEmitter() }).publish(
    UnlockAccountCommandEvent.set({ accountId }),
    context,
  );
};

let store: InMemoryDataSource<IAccount>;
let handler: UnlockAccountCommandHandler;
let lockedId: string;
let activeId: string;

beforeEach(async () => {
  jest.resetAllMocks();
  store = new InMemoryDataSource<IAccount>();
  const repository = new InMemoryAccountRepository(store);
  handler = new UnlockAccountCommandHandler(repository);

  const locked = Account.register({ email: 'eve@example.com', role: Role.USER, passwordHash: 'h', activated: true })
    .data as Account;
  for (let i = 0; i < Account.MAX_FAILED_LOGIN_ATTEMPTS; i++) locked.recordFailedLogin();
  locked.pullDomainEvents();
  await repository.save(locked);
  lockedId = locked._id.value;

  const active = Account.register({ email: 'bob@example.com', role: Role.USER, passwordHash: 'h', activated: true })
    .data as Account;
  await repository.save(active);
  activeId = active._id.value;
});

describe('UnlockAccountCommandHandler', () => {
  it('lets an administrator unlock a locked account and publishes AccountUnlocked', async () => {
    const done = await handler.handle(operationFor(lockedId, Role.ADMIN, 'root'));

    expect(done.status).toBe(OperationStatus.SUCCESS);
    expect(store.collection.get(lockedId)).toMatchObject({ status: AccountStatus.ACTIVE, failedLoginAttempts: 0 });
    expect(eventBus.publish).toHaveBeenCalledWith(
      AccountUnlockedEvent.set({ accountId: lockedId }),
      expect.any(ExecutionContext),
    );
  });

  it('refuses anyone who is not an administrator, at the guard', async () => {
    for (const role of [Role.GUEST, Role.USER]) {
      const done = await handler.handle(operationFor(lockedId, role));

      expect(done.status).toBe(OperationStatus.ERROR);
      expect(done.result?.error?.type).toBe('NotAllowed');
    }
    expect(store.collection.get(lockedId)?.status).toBe(AccountStatus.LOCKED);
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('refuses to unlock an account that is not locked', async () => {
    const done = await handler.handle(operationFor(activeId, Role.ADMIN, 'root'));

    expect(done.status).toBe(OperationStatus.ERROR);
    expect(done.result?.error?.type).toBe('AccountNotLocked');
  });

  it('fails on an unknown account', async () => {
    const done = await handler.handle(operationFor('nope', Role.ADMIN, 'root'));

    expect(done.status).toBe(OperationStatus.ERROR);
    expect(done.result?.error?.type).toBe('AccountNotFound');
  });
});
