import { expect, jest } from '@jest/globals';

import { Role } from '@SharedKernel/Domain';
import { EventBus, ExecutionContext } from '@SharedKernel/Application';
import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';

import { Account } from '@Contexts/Security/Domain/Account/Account';
import { IAccount } from '@Contexts/Security/Domain/Account/DTOs';
import { AccountStatus } from '@Contexts/Security/Domain/Account/AccountStatus';
import {
  AccountLockedException,
  InvalidCredentialsException,
} from '@Contexts/Security/Domain/Account/AccountExceptions';
import { AccountAuthenticatedEvent, AccountLockedEvent } from '@Contexts/Security/Domain/Account/Events/AccountEvents';
import { IPasswordHasher } from '@Contexts/Security/Domain/Auth/Ports/IPasswordHasher';
import { InMemoryAccountRepository } from '@Contexts/Security/Infrastructure/Repositories/InMemoryAccountRepository';
import { JwtService } from '@Contexts/Security/Infrastructure/Services/JwtService';
import { LoginCommandEvent } from './LoginCommandEvent';
import { LoginCommandHandler } from './LoginCommandHandler';

const eventBus = { connect: jest.fn(), publish: jest.fn(), subscribe: jest.fn() } as EventBus;

/** Reversible on purpose: the tests can read what was "hashed". */
const fakeHasher: IPasswordHasher = {
  hash: async plain => `hashed(${plain})`,
  compare: async (plain, hash) => hash === `hashed(${plain})`,
};

const guestContext = () =>
  new ExecutionContext({ traceId: 'trace', eventBus, auth: { subjectId: '', role: Role.GUEST } });

const login = (identifier: string, password: string) =>
  handler.execute(LoginCommandEvent.set({ identifier, password }), guestContext());

let store: InMemoryDataSource<IAccount>;
let handler: LoginCommandHandler;
let aliceId: string;

beforeEach(async () => {
  jest.resetAllMocks();
  store = new InMemoryDataSource<IAccount>();
  const repository = new InMemoryAccountRepository(store);
  handler = new LoginCommandHandler(repository, fakeHasher, new JwtService({ secret: 'test', expiresIn: '1h' }));

  const alice = Account.register({
    email: 'alice@example.com',
    role: Role.USER,
    passwordHash: 'hashed(secret)',
    activated: true,
  });
  await repository.save(alice.data as Account);
  aliceId = (alice.data as Account)._id.value;
});

describe('LoginCommandHandler', () => {
  it('signs in an active account with the right password and publishes AccountAuthenticated', async () => {
    const result = await login('alice@example.com', 'secret');

    expect(result.isSuccess()).toBe(true);
    expect(result.data).toEqual({ token: expect.any(String) });
    expect(store.collection.get(aliceId)?.lastAuthenticatedAt).toEqual(expect.any(Date));
    const [published, context] = jest.mocked(eventBus.publish).mock.calls[0];
    expect(published).toBeInstanceOf(AccountAuthenticatedEvent);
    expect(published.payload).toEqual({ accountId: aliceId, at: expect.any(Date) });
    expect(context).toBeInstanceOf(ExecutionContext);
  });

  it('refuses an unknown email and a wrong password with the same vague answer', async () => {
    const unknown = await login('nobody@example.com', 'secret');
    const wrong = await login('alice@example.com', 'nope');

    expect(unknown.error).toBeInstanceOf(InvalidCredentialsException);
    expect(wrong.error).toBeInstanceOf(InvalidCredentialsException);
  });

  it('saves the wrong password against the account even though the login failed', async () => {
    await login('alice@example.com', 'nope');

    expect(store.collection.get(aliceId)).toMatchObject({ status: AccountStatus.ACTIVE, failedLoginAttempts: 1 });
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('locks the account on the fifth wrong password in a row and publishes AccountLocked', async () => {
    for (let i = 0; i < Account.MAX_FAILED_LOGIN_ATTEMPTS; i++) await login('alice@example.com', 'nope');

    expect(store.collection.get(aliceId)?.status).toBe(AccountStatus.LOCKED);
    expect(eventBus.publish).toHaveBeenCalledTimes(1);
    expect(eventBus.publish).toHaveBeenCalledWith(
      AccountLockedEvent.set({ accountId: aliceId, failedLoginAttempts: Account.MAX_FAILED_LOGIN_ATTEMPTS }),
      expect.any(ExecutionContext),
    );
  });

  it('refuses a locked account even with the right password, and says so', async () => {
    for (let i = 0; i < Account.MAX_FAILED_LOGIN_ATTEMPTS; i++) await login('alice@example.com', 'nope');

    const result = await login('alice@example.com', 'secret');

    expect(result.error).toBeInstanceOf(AccountLockedException);
    expect(store.collection.get(aliceId)?.lastAuthenticatedAt).toBeUndefined();
  });

  it('resets the count on a successful login', async () => {
    for (let i = 0; i < Account.MAX_FAILED_LOGIN_ATTEMPTS - 1; i++) await login('alice@example.com', 'nope');
    await login('alice@example.com', 'secret');
    for (let i = 0; i < Account.MAX_FAILED_LOGIN_ATTEMPTS - 1; i++) await login('alice@example.com', 'nope');

    const result = await login('alice@example.com', 'secret');

    expect(result.isSuccess()).toBe(true);
    expect(store.collection.get(aliceId)).toMatchObject({ status: AccountStatus.ACTIVE, failedLoginAttempts: 0 });
  });
});
