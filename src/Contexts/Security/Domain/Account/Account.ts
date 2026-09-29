import { AggregateRoot, IResult, Result, Role } from '@SharedKernel/Domain';
import { Email, Id } from '@SharedKernel/Domain/ValueObjects';

import { IAccount, INewAccount } from '@Contexts/Security/Domain/Account/DTOs';
import { AccountStatus } from '@Contexts/Security/Domain/Account/AccountStatus';
import { Credentials } from '@Contexts/Security/Domain/Account/Credentials';
import {
  AccountAuthenticatedEvent,
  AccountCreatedEvent,
  AccountLockedEvent,
  AccountUnlockedEvent,
  AccountValidatedEvent,
} from '@Contexts/Security/Domain/Account/Events/AccountEvents';
import {
  AccountAlreadyActiveException,
  AccountLockedException,
  AccountNotLockedException,
  InactiveAccountException,
} from '@Contexts/Security/Domain/Account/AccountExceptions';

/**
 * Account is the aggregate root of the Security context: who can sign in, and as what.
 *
 * - an account always has a valid email and a set of credentials (value objects)
 * - it is PENDING until validated, and only an ACTIVE account can authenticate
 * - MAX_FAILED_LOGIN_ATTEMPTS wrong passwords in a row lock an ACTIVE account; a locked
 *   account refuses to authenticate even with the right password, until an administrator
 *   unlocks it. A successful sign-in resets the count
 * - the email must be unique across accounts: that rule spans the whole collection, so it
 *   lives in the AccountRegistration domain service, not here
 *
 * Checking a password against the stored hash is not business: the application layer asks
 * the IPasswordHasher port, then calls `authenticate()` or `recordFailedLogin()` to record
 * the fact.
 */
export class Account extends AggregateRoot {
  static readonly MAX_FAILED_LOGIN_ATTEMPTS = 5;

  #email: Email;
  #role: Role;
  #credentials: Credentials;
  #status: AccountStatus;
  #failedLoginAttempts: number;
  #lastAuthenticatedAt?: Date;

  private constructor(
    id: Id,
    email: Email,
    role: Role,
    credentials: Credentials,
    status: AccountStatus,
    failedLoginAttempts: number,
    lastAuthenticatedAt?: Date,
  ) {
    super(id);
    this.#email = email;
    this.#role = role;
    this.#credentials = credentials;
    this.#status = status;
    this.#failedLoginAttempts = failedLoginAttempts;
    this.#lastAuthenticatedAt = lastAuthenticatedAt;
  }

  /** Opens a brand new account. Uniqueness of the email is checked by AccountRegistration. */
  static register(props: INewAccount): IResult<Account> {
    const email = Email.create(props.email);
    if (email.isFailure()) return email;

    const credentials = Credentials.create(props.passwordHash);
    if (credentials.isFailure()) return credentials;

    const id = Id.generate();
    const status = props.activated ? AccountStatus.ACTIVE : AccountStatus.PENDING;
    const account = new Account(id, email.data, props.role, credentials.data, status, 0);
    account.record(AccountCreatedEvent.set({ accountId: id.value, email: email.data.value, role: props.role, status }));

    return Result.ok(account);
  }

  /** Rebuilds an Account from what was persisted. No event is recorded: nothing new happened. */
  static fromSnapshot(snapshot: IAccount): Account {
    const email = Email.create(snapshot.email);
    const credentials = Credentials.create(snapshot.credentials.hash);
    if (email.isFailure() || credentials.isFailure()) {
      throw new Error(`Corrupted account ${snapshot._id}`);
    }

    return new Account(
      new Id(snapshot._id),
      email.data,
      snapshot.role,
      credentials.data,
      snapshot.status,
      snapshot.failedLoginAttempts,
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
    if (this.#status === AccountStatus.LOCKED) {
      return Result.fail(new AccountLockedException(this._id.value));
    }
    if (this.#status !== AccountStatus.ACTIVE) {
      return Result.fail(new InactiveAccountException(this._id.value));
    }

    this.#failedLoginAttempts = 0;
    this.#lastAuthenticatedAt = now;
    this.record(AccountAuthenticatedEvent.set({ accountId: this._id.value, at: now }));

    return Result.ok();
  }

  /**
   * Records a wrong password. The MAX_FAILED_LOGIN_ATTEMPTS-th in a row locks the account.
   * An account that cannot sign in anyway (PENDING, already LOCKED) has nothing to protect
   * this way, so nothing is counted for it.
   */
  recordFailedLogin(): IResult {
    if (this.#status !== AccountStatus.ACTIVE) return Result.ok();

    this.#failedLoginAttempts += 1;
    if (this.#failedLoginAttempts >= Account.MAX_FAILED_LOGIN_ATTEMPTS) {
      this.#status = AccountStatus.LOCKED;
      this.record(
        AccountLockedEvent.set({ accountId: this._id.value, failedLoginAttempts: this.#failedLoginAttempts }),
      );
    }

    return Result.ok();
  }

  /** Lifts the lock: the account is ACTIVE again with a clean count. Who may ask is the handler's business. */
  unlock(): IResult {
    if (this.#status !== AccountStatus.LOCKED) {
      return Result.fail(new AccountNotLockedException(this._id.value));
    }

    this.#status = AccountStatus.ACTIVE;
    this.#failedLoginAttempts = 0;
    this.record(AccountUnlockedEvent.set({ accountId: this._id.value }));

    return Result.ok();
  }

  toSnapshot(): IAccount {
    return {
      _id: this._id.value,
      email: this.#email.value,
      role: this.#role,
      credentials: { type: this.#credentials.type, hash: this.#credentials.hash },
      status: this.#status,
      failedLoginAttempts: this.#failedLoginAttempts,
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

  get failedLoginAttempts(): number {
    return this.#failedLoginAttempts;
  }

  get lastAuthenticatedAt(): Date | undefined {
    return this.#lastAuthenticatedAt;
  }
}
