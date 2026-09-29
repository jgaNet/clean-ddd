import { expect, jest } from '@jest/globals';

import { NotAllowedException } from '@Architecture/Domain';
import { Role } from '@SharedKernel/Domain';
import { EventBus, ExecutionContext } from '@Architecture/Application';
import { InMemoryDataSource } from '@Architecture/Infrastructure/DataSources/InMemoryDataSource';

import { Account } from '@Contexts/Security/Domain/Account/Account';
import { IAccount } from '@Contexts/Security/Domain/Account/DTOs';
import {
  InvalidCredentialsException,
  PasswordTooShortException,
} from '@Contexts/Security/Domain/Account/AccountExceptions';
import { AccountPasswordChangedEvent } from '@Contexts/Security/Domain/Account/Events/AccountEvents';
import { IPasswordHasher } from '@Contexts/Security/Domain/Auth/Ports/IPasswordHasher';
import { InMemoryAccountRepository } from '@Contexts/Security/Infrastructure/Repositories/InMemoryAccountRepository';
import { ChangePasswordCommandEvent, ChangePasswordCommandHandler } from '@Contexts/Security/Application/Commands';

const eventBus = { connect: jest.fn(), publish: jest.fn(), subscribe: jest.fn() } as EventBus;

/** Reversible on purpose: the tests can read what was "hashed". */
const fakeHasher: IPasswordHasher = {
  hash: async plain => `hashed(${plain})`,
  compare: async (plain, hash) => hash === `hashed(${plain})`,
};

const contextFor = (subjectId: string | undefined, role: Role = Role.USER) =>
  new ExecutionContext({ traceId: 'trace', eventBus, auth: { subjectId, role } });

let store: InMemoryDataSource<IAccount>;
let repository: InMemoryAccountRepository;
let handler: ChangePasswordCommandHandler;
let aliceId: string;

beforeEach(async () => {
  jest.resetAllMocks();
  store = new InMemoryDataSource<IAccount>();
  repository = new InMemoryAccountRepository(store);
  handler = new ChangePasswordCommandHandler(repository, fakeHasher);

  const alice = Account.register({
    email: 'alice@example.com',
    role: Role.USER,
    passwordHash: 'hashed(old-secret)',
    activated: true,
  });
  if (alice.isFailure()) throw alice.error;
  await repository.save(alice.data);
  aliceId = alice.data._id.value;
});

const changePassword = (currentPassword: string, newPassword: string, context = contextFor(aliceId)) =>
  handler.execute(ChangePasswordCommandEvent.set({ currentPassword, newPassword }), context);

describe('ChangePasswordCommandHandler', () => {
  it('stores the hash of the new password of the caller and publishes AccountPasswordChanged', async () => {
    const result = await changePassword('old-secret', 'new-secret-1');

    expect(result.isSuccess()).toBe(true);
    expect(store.collection.get(aliceId)?.credentials).toEqual({ type: 'password', hash: 'hashed(new-secret-1)' });
    expect(eventBus.publish).toHaveBeenCalledWith(
      AccountPasswordChangedEvent.set({ accountId: aliceId }),
      expect.any(ExecutionContext),
    );
  });

  it('refuses a wrong current password and keeps the old one', async () => {
    const result = await changePassword('not-it', 'new-secret-1');

    expect(result.error).toBeInstanceOf(InvalidCredentialsException);
    expect(store.collection.get(aliceId)?.credentials.hash).toBe('hashed(old-secret)');
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('refuses a new password shorter than 8 characters', async () => {
    const result = await changePassword('old-secret', 'short7!');

    expect(result.error).toBeInstanceOf(PasswordTooShortException);
    expect(store.collection.get(aliceId)?.credentials.hash).toBe('hashed(old-secret)');
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('refuses an anonymous caller', async () => {
    const result = await changePassword('old-secret', 'new-secret-1', contextFor(undefined, Role.GUEST));

    expect(result.error).toBeInstanceOf(NotAllowedException);
    expect(store.collection.get(aliceId)?.credentials.hash).toBe('hashed(old-secret)');
  });
});
