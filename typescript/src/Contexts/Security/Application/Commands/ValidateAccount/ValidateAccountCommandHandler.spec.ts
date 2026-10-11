import { expect, jest } from '@jest/globals';

import { NotAllowedException } from '@Architecture/Domain';
import { Role } from '@SharedKernel/Domain';
import { EventBus, ExecutionContext } from '@Architecture/Application';
import { InMemoryDataSource } from '@Architecture/Infrastructure/DataSources/InMemoryDataSource';

import { Account } from '@Contexts/Security/Domain/Account/Account';
import { IAccount } from '@Contexts/Security/Domain/Account/DTOs';
import { AccountStatus } from '@Contexts/Security/Domain/Account/AccountStatus';
import { TokenTypes } from '@Contexts/Security/Domain/Auth/TokenTypes';
import { InMemoryAccountRepository } from '@Contexts/Security/Infrastructure/Repositories/InMemoryAccountRepository';
import { JoseSignedTokens } from '@Contexts/Security/Infrastructure/Services/JoseSignedTokens';
import { ValidateAccountCommandEvent } from './ValidateAccountCommandEvent';
import { ValidateAccountCommandHandler } from './ValidateAccountCommandHandler';

const eventBus = { connect: jest.fn(), publish: jest.fn(), subscribe: jest.fn() } as EventBus;
const contextFor = (role: Role, subjectId = '') =>
  new ExecutionContext({ traceId: 'trace', eventBus, auth: { subjectId, role } });

const jwt = new JoseSignedTokens({ secret: 'test', expiresIn: '1h' });

let store: InMemoryDataSource<IAccount>;
let handler: ValidateAccountCommandHandler;
let pendingId: string;

beforeEach(async () => {
  jest.resetAllMocks();
  store = new InMemoryDataSource<IAccount>();
  const repository = new InMemoryAccountRepository(store);
  handler = new ValidateAccountCommandHandler(repository, jwt);

  const pending = Account.register({ email: 'eve@example.com', role: Role.USER, passwordHash: 'h', activated: false });
  await repository.save(pending.data as Account);
  pendingId = (pending.data as Account)._id.value;
});

describe('ValidateAccountCommandHandler', () => {
  it('validates with the validation token emailed at sign-up, whoever presents it', async () => {
    const validationToken = await jwt.issue({ subjectId: pendingId, subjectType: TokenTypes.VALIDATION });

    const result = await handler.execute(ValidateAccountCommandEvent.set({ validationToken }), contextFor(Role.GUEST));

    expect(result.isSuccess()).toBe(true);
    expect(store.collection.get(pendingId)?.status).toBe(AccountStatus.ACTIVE);
  });

  it('validates by id for an administrator', async () => {
    const result = await handler.execute(
      ValidateAccountCommandEvent.set({ accountId: pendingId }),
      contextFor(Role.ADMIN, 'root'),
    );

    expect(result.isSuccess()).toBe(true);
    expect(store.collection.get(pendingId)?.status).toBe(AccountStatus.ACTIVE);
  });

  it('refuses validation by id from anyone else, whatever the payload says', async () => {
    for (const context of [contextFor(Role.GUEST), contextFor(Role.USER, 'someone')]) {
      const result = await handler.execute(ValidateAccountCommandEvent.set({ accountId: pendingId }), context);

      expect(result.error).toBeInstanceOf(NotAllowedException);
    }
    expect(store.collection.get(pendingId)?.status).toBe(AccountStatus.PENDING);
  });

  it('refuses a login token presented as a validation token', async () => {
    const loginToken = await jwt.issue({ subjectId: pendingId, subjectType: Role.USER });

    const result = await handler.execute(
      ValidateAccountCommandEvent.set({ validationToken: loginToken }),
      contextFor(Role.GUEST),
    );

    expect(result.error).toBeInstanceOf(NotAllowedException);
    expect(store.collection.get(pendingId)?.status).toBe(AccountStatus.PENDING);
  });
});
