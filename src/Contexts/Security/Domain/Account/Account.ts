import { AggregateRoot, IResult, Result, Role } from '@SharedKernel/Domain';
import { Email, Id } from '@SharedKernel/Domain/ValueObjects';

import { IAccount, INewAccount } from '@Contexts/Security/Domain/Account/DTOs';
import { AccountStatus } from '@Contexts/Security/Domain/Account/AccountStatus';
import { Credentials } from '@Contexts/Security/Domain/Account/Credentials';
import {
  AccountAuthenticatedEvent,
  AccountCreatedEvent,
  AccountValidatedEvent,
} from '@Contexts/Security/Domain/Account/Events/AccountEvents';
import { AccountAlreadyActiveException } from '@Contexts/Security/Domain/Account/AccountExceptions';
import { InactiveAccountException } from '@Contexts/Security/Domain/Auth/Exceptions/InactiveAccountException';

/**
 * Account is the aggregate root of the Security context: who can sign in, and as what.
 *
 * - an account always has a valid email and a set of credentials (value objects)
 * - it is PENDING until validated, and only an ACTIVE account can authenticate
 * - the email must be unique across accounts: that rule spans the whole collection, so it
 *   lives in the AccountRegistration domain service, not here
 *
 * Checking a password against the stored hash is not business: the application layer asks
 * the IPasswordHasher port, then calls `authenticate()` to record the fact.
 */
export class Account extends AggregateRoot {
  #email: Email;
  #role: Role;
  #credentials: Credentials;
  #status: AccountStatus;
  #lastAuthenticatedAt?: Date;

  private constructor(
    id: Id,
    email: Email,
    role: Role,
    credentials: Credentials,
    status: AccountStatus,
    lastAuthenticatedAt?: Date,
  ) {
    super(id);
    this.#email = email;
    this.#role = role;
    this.#credentials = credentials;
    this.#status = status;
    this.#lastAuthenticatedAt = lastAuthenticatedAt;
  }

  /** Opens a brand new account. Uniqueness of the email is checked by AccountRegistration. */
  static register(props: INewAccount): IResult<Account> {
    const email = Email.create(props.email);
    if (email.isFailure()) return email;

    const credentials = Credentials.password(props.passwordHash);
    if (credentials.isFailure()) return credentials;

    const id = Id.generate();
    const status = props.activated ? AccountStatus.ACTIVE : AccountStatus.PENDING;
    const account = new Account(id, email.data, props.role, credentials.data, status);
    account.record(AccountCreatedEvent.set({ accountId: id.value, email: email.data.value, role: props.role, status }));

    return Result.ok(account);
  }

  /** Rebuilds an Account from what was persisted. No event is recorded: nothing new happened. */
  static fromSnapshot(snapshot: IAccount): Account {
    const email = Email.create(snapshot.email);
    const credentials = Credentials.password(snapshot.credentials.hash);
    if (email.isFailure() || credentials.isFailure()) {
      throw new Error(`Corrupted account ${snapshot._id}`);
    }

    return new Account(
      new Id(snapshot._id),
      email.data,
      snapshot.role,
      credentials.data,
      snapshot.status,
      snapshot.lastAuthenticatedAt,
    );
  }

  /** Confirms the email address: the account becomes usable. */
  validate(): IResult {
    if (this.#status === AccountStatus.ACTIVE) {
      return Result.fail(new AccountAlreadyActiveException(this._id.value));
    }

    this.#status = AccountStatus.ACTIVE;
    this.record(AccountValidatedEvent.set({ accountId: this._id.value, email: this.#email.value }));

    return Result.ok();
  }

  /** Records a successful sign-in. The caller has already verified the credentials. */
  authenticate(now: Date = new Date()): IResult {
    if (this.#status !== AccountStatus.ACTIVE) {
      return Result.fail(new InactiveAccountException('Account is not active'));
    }

    this.#lastAuthenticatedAt = now;
    this.record(AccountAuthenticatedEvent.set({ accountId: this._id.value, at: now }));

    return Result.ok();
  }

  toSnapshot(): IAccount {
    return {
      _id: this._id.value,
      email: this.#email.value,
      role: this.#role,
      credentials: { type: this.#credentials.type, hash: this.#credentials.hash },
      status: this.#status,
      lastAuthenticatedAt: this.#lastAuthenticatedAt,
    };
  }

  get email(): Email {
    return this.#email;
  }

  get role(): Role {
    return this.#role;
  }

  get credentials(): Credentials {
    return this.#credentials;
  }

  get status(): AccountStatus {
    return this.#status;
  }

  get lastAuthenticatedAt(): Date | undefined {
    return this.#lastAuthenticatedAt;
  }
}
