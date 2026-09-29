import { expect, jest } from '@jest/globals';

import { InvalidEmailFormat, Role } from '@SharedKernel/Domain';
import { EventBus, ExecutionContext } from '@SharedKernel/Application';
import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';

import { IAccount } from '@Contexts/Security/Domain/Account/DTOs';
import { AccountPlan } from '@Contexts/Security/Domain/Account/AccountPlan';
import { AccountStatus } from '@Contexts/Security/Domain/Account/AccountStatus';
import { AccountRegistration } from '@Contexts/Security/Domain/Account/AccountRegistration';
import { AccountAlreadyExistsException } from '@Contexts/Security/Domain/Account/AccountExceptions';
import { AccountCreatedEvent } from '@Contexts/Security/Domain/Account/Events/AccountEvents';
import { IPasswordHasher } from '@Contexts/Security/Domain/Auth/Ports/IPasswordHasher';
import { InMemoryAccountRepository } from '@Contexts/Security/Infrastructure/Repositories/InMemoryAccountRepository';
import { SignUpCommandEvent, SignUpCommandHandler } from '@Contexts/Security/Application/Commands';

const eventBus = { connect: jest.fn(), publish: jest.fn(), subscribe: jest.fn() } as EventBus;

/** Reversible on purpose: the tests can read what was "hashed". */
const fakeHasher: IPasswordHasher = {
  hash: async plain => `hashed(${plain})`,
  compare: async (plain, hash) => hash === `hashed(${plain})`,
};

const guestContext = () =>
  new ExecutionContext({ traceId: 'trace', eventBus, auth: { subjectId: '', role: Role.GUEST } });

let store: InMemoryDataSource<IAccount>;
let handler: SignUpCommandHandler;

beforeEach(() => {
  jest.resetAllMocks();
  store = new InMemoryDataSource<IAccount>();
  const repository = new InMemoryAccountRepository(store);
  handler = new SignUpCommandHandler(repository, new AccountRegistration(repository), fakeHasher);
});

describe('SignUpCommandHandler', () => {
  it('saves a pending user account with a hashed password and publishes AccountCreated', async () => {
    const result = await handler.execute(
      SignUpCommandEvent.set({ email: 'user@user.fr', password: 'secret' }),
      guestContext(),
    );

    expect(result.isSuccess()).toBe(true);
    const accountId = result.data as string;
    expect(store.collection.get(accountId)).toEqual({
      _id: accountId,
      email: 'user@user.fr',
      role: Role.USER,
      credentials: { type: 'password', hash: 'hashed(secret)' },
      status: AccountStatus.PENDING,
      plan: AccountPlan.FREE,
      lastAuthenticatedAt: undefined,
    });
    expect(eventBus.publish).toHaveBeenCalledWith(
      AccountCreatedEvent.set({ accountId, email: 'user@user.fr', role: Role.USER, status: AccountStatus.PENDING }),
      expect.any(ExecutionContext),
    );
  });

  it('refuses a malformed email and saves nothing', async () => {
    const result = await handler.execute(
      SignUpCommandEvent.set({ email: 'simple-nickname', password: 'secret' }),
      guestContext(),
    );

    expect(result.error).toBeInstanceOf(InvalidEmailFormat);
    expect(store.collection.size).toBe(0);
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('refuses an email that already has an account', async () => {
    await handler.execute(SignUpCommandEvent.set({ email: 'user@user.fr', password: 'secret' }), guestContext());

    const result = await handler.execute(
      SignUpCommandEvent.set({ email: 'user@user.fr', password: 'other' }),
      guestContext(),
    );

    expect(result.error).toBeInstanceOf(AccountAlreadyExistsException);
    expect(store.collection.size).toBe(1);
  });
});
