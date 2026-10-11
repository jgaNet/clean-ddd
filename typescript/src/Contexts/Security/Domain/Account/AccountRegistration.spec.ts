import { Role } from '@SharedKernel/Domain';

import { Account } from '@Contexts/Security/Domain/Account/Account';
import { AccountRegistration } from '@Contexts/Security/Domain/Account/AccountRegistration';
import { AccountAlreadyExistsException } from '@Contexts/Security/Domain/Account/AccountExceptions';
import { IAccountRepository } from '@Contexts/Security/Domain/Account/Ports/IAccountRepository';

/** A domain test needs only the port: a Map is enough of a repository. */
class FakeAccountRepository implements IAccountRepository {
  #accounts = new Map<string, Account>();

  async findById(id: string) {
    return this.#accounts.get(id) ?? null;
  }
  async findByEmail(email: string) {
    return [...this.#accounts.values()].find(account => account.email.value === email.toLowerCase()) ?? null;
  }
  async save(account: Account) {
    this.#accounts.set(account._id.value, account);
  }
}

const alice = { email: 'alice@example.com', role: Role.USER, passwordHash: 'h4sh', activated: false };

describe('AccountRegistration (domain service)', () => {
  let repository: FakeAccountRepository;
  let registration: AccountRegistration;

  beforeEach(() => {
    repository = new FakeAccountRepository();
    registration = new AccountRegistration(repository);
  });

  it('registers an account for a free email', async () => {
    const result = await registration.register(alice);

    expect(result.isSuccess()).toBe(true);
    expect(result.data?.email.value).toBe('alice@example.com');
  });

  it('refuses an email that already identifies an account, whatever its case', async () => {
    const first = await registration.register(alice);
    await repository.save(first.data as Account);

    const second = await registration.register({ ...alice, email: 'ALICE@example.com' });

    expect(second.error).toBeInstanceOf(AccountAlreadyExistsException);
  });
});
