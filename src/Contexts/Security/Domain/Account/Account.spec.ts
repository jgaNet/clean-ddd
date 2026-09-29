import { InvalidEmailFormat, Role } from '@SharedKernel/Domain';

import { Account } from '@Contexts/Security/Domain/Account/Account';
import { AccountStatus } from '@Contexts/Security/Domain/Account/AccountStatus';
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
  InvalidCredentialsException,
} from '@Contexts/Security/Domain/Account/AccountExceptions';

function aPendingAccount(): Account {
  const account = Account.register({
    email: 'alice@example.com',
    role: Role.USER,
    passwordHash: 'h4sh',
    activated: false,
  });
  if (account.isFailure()) throw account.error;
  account.data.pullDomainEvents();
  return account.data;
}

function anActiveAccount(): Account {
  const account = aPendingAccount();
  account.validate();
  account.pullDomainEvents();
  return account;
}

function aLockedAccount(): Account {
  const account = anActiveAccount();
  for (let i = 0; i < Account.MAX_FAILED_LOGIN_ATTEMPTS; i++) account.recordFailedLogin();
  account.pullDomainEvents();
  return account;
}

describe('Account', () => {
  describe('registering', () => {
    it('opens a pending user account and records AccountCreated', () => {
      const result = Account.register({
        email: 'Alice@Example.com',
        role: Role.USER,
        passwordHash: 'h4sh',
        activated: false,
      });

      expect(result.isSuccess()).toBe(true);
      const account = result.data as Account;
      expect(account.email.value).toBe('alice@example.com');
      expect(account.status).toBe(AccountStatus.PENDING);
      expect(account.pullDomainEvents()).toEqual([
        AccountCreatedEvent.set({
          accountId: account._id.value,
          email: 'alice@example.com',
          role: Role.USER,
          status: AccountStatus.PENDING,
        }),
      ]);
    });

    it('opens an administrator account that is active at once', () => {
      const account = Account.register({
        email: 'root@example.com',
        role: Role.ADMIN,
        passwordHash: 'h4sh',
        activated: true,
      });

      expect(account.data?.status).toBe(AccountStatus.ACTIVE);
    });

    it('refuses a malformed email', () => {
      const result = Account.register({
        email: 'not-an-email',
        role: Role.USER,
        passwordHash: 'h4sh',
        activated: false,
      });

      expect(result.error).toBeInstanceOf(InvalidEmailFormat);
    });

    it('refuses empty credentials', () => {
      const result = Account.register({
        email: 'alice@example.com',
        role: Role.USER,
        passwordHash: '',
        activated: false,
      });

      expect(result.error).toBeInstanceOf(InvalidCredentialsException);
    });
  });

  describe('validating', () => {
    it('activates a pending account and records AccountValidated', () => {
      const account = aPendingAccount();

      expect(account.validate().isSuccess()).toBe(true);
      expect(account.status).toBe(AccountStatus.ACTIVE);
      expect(account.pullDomainEvents()).toEqual([
        AccountValidatedEvent.set({ accountId: account._id.value, email: 'alice@example.com' }),
      ]);
    });

    it('cannot validate twice', () => {
      const account = aPendingAccount();
      account.validate();

      expect(account.validate().error).toBeInstanceOf(AccountAlreadyActiveException);
    });
  });

  describe('authenticating', () => {
    it('records the sign-in of an active account', () => {
      const account = aPendingAccount();
      account.validate();
      account.pullDomainEvents();
      const now = new Date('2026-01-01T10:00:00Z');

      expect(account.authenticate(now).isSuccess()).toBe(true);
      expect(account.lastAuthenticatedAt).toEqual(now);
      expect(account.pullDomainEvents()).toEqual([
        AccountAuthenticatedEvent.set({ accountId: account._id.value, at: now }),
      ]);
    });

    it('refuses a pending account', () => {
      const account = aPendingAccount();

      expect(account.authenticate().error).toBeInstanceOf(InactiveAccountException);
      expect(account.lastAuthenticatedAt).toBeUndefined();
    });

    it('refuses a locked account, even though the password was right', () => {
      const account = aLockedAccount();

      expect(account.authenticate().error).toBeInstanceOf(AccountLockedException);
      expect(account.lastAuthenticatedAt).toBeUndefined();
      expect(account.pullDomainEvents()).toEqual([]);
    });

    it('resets the count of wrong passwords', () => {
      const account = anActiveAccount();
      for (let i = 0; i < Account.MAX_FAILED_LOGIN_ATTEMPTS - 1; i++) account.recordFailedLogin();

      account.authenticate();
      for (let i = 0; i < Account.MAX_FAILED_LOGIN_ATTEMPTS - 1; i++) account.recordFailedLogin();

      expect(account.status).toBe(AccountStatus.ACTIVE);
      expect(account.failedLoginAttempts).toBe(Account.MAX_FAILED_LOGIN_ATTEMPTS - 1);
    });
  });

  describe('locking', () => {
    it('counts a wrong password without locking before the limit', () => {
      const account = anActiveAccount();
      for (let i = 0; i < Account.MAX_FAILED_LOGIN_ATTEMPTS - 1; i++) {
        expect(account.recordFailedLogin().isSuccess()).toBe(true);
      }

      expect(account.status).toBe(AccountStatus.ACTIVE);
      expect(account.failedLoginAttempts).toBe(Account.MAX_FAILED_LOGIN_ATTEMPTS - 1);
      expect(account.pullDomainEvents()).toEqual([]);
    });

    it('locks on the fifth wrong password in a row and records AccountLocked', () => {
      const account = anActiveAccount();
      for (let i = 0; i < Account.MAX_FAILED_LOGIN_ATTEMPTS; i++) account.recordFailedLogin();

      expect(account.status).toBe(AccountStatus.LOCKED);
      expect(account.pullDomainEvents()).toEqual([
        AccountLockedEvent.set({
          accountId: account._id.value,
          failedLoginAttempts: Account.MAX_FAILED_LOGIN_ATTEMPTS,
        }),
      ]);
    });

    it('counts nothing for an account that cannot sign in anyway', () => {
      const pending = aPendingAccount();
      const locked = aLockedAccount();
      for (let i = 0; i < Account.MAX_FAILED_LOGIN_ATTEMPTS; i++) {
        pending.recordFailedLogin();
        locked.recordFailedLogin();
      }

      expect(pending.status).toBe(AccountStatus.PENDING);
      expect(pending.failedLoginAttempts).toBe(0);
      expect(locked.failedLoginAttempts).toBe(Account.MAX_FAILED_LOGIN_ATTEMPTS);
      expect([...pending.pullDomainEvents(), ...locked.pullDomainEvents()]).toEqual([]);
    });
  });

  describe('unlocking', () => {
    it('makes a locked account active again with a clean count and records AccountUnlocked', () => {
      const account = aLockedAccount();

      expect(account.unlock().isSuccess()).toBe(true);
      expect(account.status).toBe(AccountStatus.ACTIVE);
      expect(account.failedLoginAttempts).toBe(0);
      expect(account.pullDomainEvents()).toEqual([AccountUnlockedEvent.set({ accountId: account._id.value })]);
      expect(account.authenticate().isSuccess()).toBe(true);
    });

    it('refuses an account that is not locked', () => {
      const account = anActiveAccount();

      expect(account.unlock().error).toBeInstanceOf(AccountNotLockedException);
      expect(account.pullDomainEvents()).toEqual([]);
    });
  });

  describe('persistence round-trip', () => {
    it('gives back an equal account after toSnapshot / fromSnapshot, without events', () => {
      const account = aPendingAccount();
      account.validate();
      account.authenticate(new Date('2026-01-01T10:00:00Z'));
      account.recordFailedLogin();

      const rebuilt = Account.fromSnapshot(account.toSnapshot());

      expect(rebuilt.equals(account)).toBe(true);
      expect(rebuilt.toSnapshot()).toEqual(account.toSnapshot());
      expect(rebuilt.pullDomainEvents()).toEqual([]);
    });
  });
});
