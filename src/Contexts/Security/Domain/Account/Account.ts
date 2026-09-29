import { AggregateRoot, IResult, Result, Role } from '@SharedKernel/Domain';
import { Email, Id } from '@SharedKernel/Domain/ValueObjects';

import { IAccount, INewAccount } from '@Contexts/Security/Domain/Account/DTOs';
import { AccountPlan } from '@Contexts/Security/Domain/Account/AccountPlan';
import { AccountStatus } from '@Contexts/Security/Domain/Account/AccountStatus';
import { Credentials } from '@Contexts/Security/Domain/Account/Credentials';
import {
  AccountAuthenticatedEvent,
  AccountCreatedEvent,
  AccountPlanChangedEvent,
  AccountValidatedEvent,
} from '@Contexts/Security/Domain/Account/Events/AccountEvents';
import {
  AccountAlreadyActiveException,
  AccountAlreadyOnPlanException,
  InactiveAccountException,
} from '@Contexts/Security/Domain/Account/AccountExceptions';

/**
 * Account is the aggregate root of the Security context: who can sign in, and as what.
 *
 * - an account always has a valid email and a set of credentials (value objects)
 * - it is PENDING until validated, and only an ACTIVE account can authenticate
 * - it is on the FREE plan until an administrator puts it on another one (`changePlan()`);
 *   who may do that is the command handler's guard, what the plan allows is other contexts' business
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
  #plan: AccountPlan;
  #lastAuthenticatedAt?: Date;

  private constructor(
    id: Id,
    email: Email,
    role: Role,
    credentials: Credentials,
    status: AccountStatus,
    plan: AccountPlan,
    lastAuthenticatedAt?: Date,
  ) {
    super(id);
    this.#email = email;
    this.#role = role;
    this.#credentials = credentials;
    this.#status = status;
    this.#plan = plan;
    this.#lastAuthenticatedAt = lastAuthenticatedAt;
  }

  /** Opens a brand new account, on the free plan. Uniqueness of the email is checked by AccountRegistration. */
  static register(props: INewAccount): IResult<Account> {
    const email = Email.create(props.email);
    if (email.isFailure()) return email;

    const credentials = Credentials.create(props.passwordHash);
    if (credentials.isFailure()) return credentials;

    const id = Id.generate();
    const status = props.activated ? AccountStatus.ACTIVE : AccountStatus.PENDING;
    const account = new Account(id, email.data, props.role, credentials.data, status, AccountPlan.FREE);
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
      snapshot.plan,
      snapshot.lastAuthenticatedAt,
    );
  }

  /** Moves the account to another plan. Reserved to administrators: the command handler's guard says so. */
  changePlan(plan: AccountPlan): IResult {
    if (this.#plan === plan) {
      return Result.fail(new AccountAlreadyOnPlanException(this._id.value, plan));
    }

    this.#plan = plan;
    this.record(AccountPlanChangedEvent.set({ accountId: this._id.value, plan }));

    return Result.ok();
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
      return Result.fail(new InactiveAccountException(this._id.value));
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
      plan: this.#plan,
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

  get plan(): AccountPlan {
    return this.#plan;
  }

  get lastAuthenticatedAt(): Date | undefined {
    return this.#lastAuthenticatedAt;
  }
}
