import { EventEmitter } from 'events';
import { expect } from '@jest/globals';

import { NotAllowedException, Role } from '@SharedKernel/Domain';
import { ExecutionContext, OperationStatus } from '@SharedKernel/Application';
import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';
import { InMemoryEventBus } from '@SharedKernel/Infrastructure/EventBus/InMemoryEventBus';

import { IAccount } from '@Contexts/Security/Domain/Account/DTOs';
import { AccountStatus } from '@Contexts/Security/Domain/Account/AccountStatus';
import { AccountRegistration } from '@Contexts/Security/Domain/Account/AccountRegistration';
import { IPasswordHasher } from '@Contexts/Security/Domain/Auth/Ports/IPasswordHasher';
import { InMemoryAccountRepository } from '@Contexts/Security/Infrastructure/Repositories/InMemoryAccountRepository';
import { RegisterAdminCommandEvent, RegisterAdminCommandHandler } from '@Contexts/Security/Application/Commands';

const fakeHasher: IPasswordHasher = {
  hash: async plain => `hashed(${plain})`,
  compare: async (plain, hash) => hash === `hashed(${plain})`,
};

// The rule is in guard(), which only handle() runs: the spec goes through an operation, as the bus would.
const eventBus = new InMemoryEventBus({ eventEmitter: new EventEmitter() });
const register = (handler: RegisterAdminCommandHandler, role: Role) => {
  const context = new ExecutionContext({ traceId: 'trace', eventBus, auth: { subjectId: 'caller', role } });
  const command = RegisterAdminCommandEvent.set({ email: 'root@example.com', password: 'secret' });
  return handler.handle(eventBus.publish(command, context));
};

let store: InMemoryDataSource<IAccount>;
let handler: RegisterAdminCommandHandler;

beforeEach(() => {
  store = new InMemoryDataSource<IAccount>();
  const repository = new InMemoryAccountRepository(store);
  handler = new RegisterAdminCommandHandler(repository, new AccountRegistration(repository), fakeHasher);
});

describe('RegisterAdminCommandHandler', () => {
  it('lets an administrator open an account that is active at once', async () => {
    const operation = await register(handler, Role.ADMIN);

    expect(operation.status).toBe(OperationStatus.SUCCESS);
    const accountId = operation.result?.data as string;
    expect(store.collection.get(accountId)).toMatchObject({ role: Role.ADMIN, status: AccountStatus.ACTIVE });
  });

  it('refuses anyone else before touching the store', async () => {
    const operation = await register(handler, Role.USER);

    expect(operation.status).toBe(OperationStatus.ERROR);
    expect(operation.result?.error).toBeInstanceOf(NotAllowedException);
    expect(store.collection.size).toBe(0);
  });
});
