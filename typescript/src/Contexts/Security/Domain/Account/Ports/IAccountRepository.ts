import { Account } from '@Contexts/Security/Domain/Account/Account';

/**
 * Write side of persistence: loads and saves the Account aggregate. `findByEmail` is here,
 * not in the queries, because the domain itself needs it (AccountRegistration) and the
 * result is an aggregate, not a read model.
 */
export interface IAccountRepository {
  findById(id: string): Promise<Account | null>;
  findByEmail(email: string): Promise<Account | null>;
  save(account: Account): Promise<void>;
}
