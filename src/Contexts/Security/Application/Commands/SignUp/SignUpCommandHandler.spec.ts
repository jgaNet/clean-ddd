import { expect, jest } from '@jest/globals';

import { Role, InvalidEmailFormat } from '@SharedKernel/Domain';
import { EventBus, ExecutionContext } from '@SharedKernel/Application';
import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';

import { Account } from '@Contexts/Security/Domain/Account/Account';
import { InMemoryAccountRepository } from '@Contexts/Security/Infrastructure/Repositories/InMemoryAccountRepository';
import { SignUpCommandEvent, SignUpCommandHandler } from '@Contexts/Security/Application/Commands';

const eventBus = { connect: jest.fn(), publish: jest.fn(), subscribe: jest.fn() } as EventBus;

const guestContext = () =>
  new ExecutionContext({ traceId: 'trace', eventBus, auth: { subjectId: '', role: Role.GUEST } });

let store: InMemoryDataSource<Account>;
let handler: SignUpCommandHandler;

beforeEach(() => {
  jest.resetAllMocks();
  store = new InMemoryDataSource<Account>();
  handler = new SignUpCommandHandler(new InMemoryAccountRepository(store));
});

describe('how to create an account', function () {
  it('should sign up a new account with email', async () => {
    await handler.execute(
      SignUpCommandEvent.set({
        subjectId: 'user@user.fr',
        subjectType: 'user',
        credentials: { type: 'password', value: 'password' },
        isActive: false,
      }),
      guestContext(),
    );

    expect(store.collection.size).toBe(1);
    const [savedAccount] = store.collection.values();
    expect(savedAccount.subjectId).toEqual('user@user.fr');
    expect(savedAccount.subjectType).toEqual(Role.USER);
    expect(savedAccount.credentials).toEqual({ type: 'password', value: 'password' });
    expect(savedAccount.isActive).toEqual(false);
  });

  it('should not sign up a new account if no email', async () => {
    const result = await handler.execute(
      SignUpCommandEvent.set({
        subjectId: 'simple-nickname',
        subjectType: 'user',
        credentials: { type: 'password', value: 'password' },
        isActive: false,
      }),
      guestContext(),
    );

    expect(store.collection.size).toBe(0);
    expect(result.isFailure()).toBeTruthy();
    expect(result.error).toBeInstanceOf(InvalidEmailFormat);
  });
});
