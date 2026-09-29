import { expect, jest } from '@jest/globals';

import { Role } from '@SharedKernel/Domain';
import { EventBus, ExecutionContext } from '@SharedKernel/Application';
import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';

import { Account } from '@Contexts/Security/Domain/Account/Account';
import { IAccount } from '@Contexts/Security/Domain/Account/DTOs';
import {
  InactiveAccountException,
  InvalidCredentialsException,
} from '@Contexts/Security/Domain/Account/AccountExceptions';
import { AccountAuthenticatedEvent } from '@Contexts/Security/Domain/Account/Events/AccountEvents';
import { IPasswordHasher } from '@Contexts/Security/Domain/Auth/Ports/IPasswordHasher';
import { InMemoryAccountRepository } from '@Contexts/Security/Infrastructure/Repositories/InMemoryAccountRepository';
import { JwtService } from '@Contexts/Security/Infrastructure/Services/JwtService';
import { LoginCommandEvent, LoginCommandHandler } from '@Contexts/Security/Application/Commands';

const eventBus = { connect: jest.fn(), publish: jest.fn(), subscribe: jest.fn() } as EventBus;

/** Reversible on purpose: the tests can read what was "hashed". */
const fakeHasher: IPasswordHasher = {
  hash: async plain => `hashed(${plain})`,
  compare: async (plain, hash) => hash === `hashed(${plain})`,
};

const guestContext = () =>
  new ExecutionContext({ traceId: 'trace', eventBus, auth: { subjectId: '', role: Role.GUEST } });

let store: InMemoryDataSource<IAccount>;
let repository: InMemoryAccountRepository;
let handler: LoginCommandHandler;

beforeEach(() => {
  jest.resetAllMocks();
  store = new InMemoryDataSource<IAccount>();
  repository = new InMemoryAccountRepository(store);
  handler = new LoginCommandHandler(repository, fakeHasher, new JwtService({ secret: 'test', expiresIn: '1h' }));
});

async function anAccount(email: string, activated: boolean): Promise<string> {
  const account = Account.register({ email, role: Role.USER, passwordHash: 'hashed(secret)', activated });
  if (account.isFailure()) throw account.error;
  await repository.save(account.data);
  return account.data._id.value;
}

const login = (identifier: string, password: string) =>
  handler.execute(LoginCommandEvent.set({ identifier, password }), guestContext());

describe('LoginCommandHandler', () => {
  it('signs in an active account with the right password and publishes AccountAuthenticated', async () => {
    const aliceId = await anAccount('alice@example.com', true);

    const result = await login('alice@example.com', 'secret');

    expect(result.isSuccess()).toBe(true);
    expect(result.data).toEqual({ token: expect.any(String) });
    expect(store.collection.get(aliceId)?.lastAuthenticatedAt).toEqual(expect.any(Date));
    const [published] = jest.mocked(eventBus.publish).mock.calls[0];
    expect(published).toBeInstanceOf(AccountAuthenticatedEvent);
  });

  it('refuses an unknown email and a wrong password with the same vague answer', async () => {
    await anAccount('alice@example.com', true);

    const unknown = await login('nobody@example.com', 'secret');
    const wrong = await login('alice@example.com', 'nope');

    expect(unknown.error).toBeInstanceOf(InvalidCredentialsException);
    expect(wrong.error).toBeInstanceOf(InvalidCredentialsException);
    expect(unknown.error?.message).toBe(wrong.error?.message);
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('refuses a pending account even with the right password', async () => {
    await anAccount('pending@example.com', false);

    const result = await login('pending@example.com', 'secret');

    expect(result.isFailure()).toBe(true);
    expect(result.error).toBeInstanceOf(InactiveAccountException);
  });
});
