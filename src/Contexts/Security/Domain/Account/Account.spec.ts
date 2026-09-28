import { InvalidEmailFormat, Role } from '@SharedKernel/Domain';

import { Account } from '@Contexts/Security/Domain/Account/Account';
import { AccountStatus } from '@Contexts/Security/Domain/Account/AccountStatus';
import {
  AccountAuthenticatedEvent,
  AccountCreatedEvent,
  AccountValidatedEvent,
} from '@Contexts/Security/Domain/Account/Events/AccountEvents';
import { AccountAlreadyActiveException } from '@Contexts/Security/Domain/Account/AccountExceptions';
import { InactiveAccountException } from '@Contexts/Security/Domain/Auth/Exceptions/InactiveAccountException';
import { InvalidCredentialsException } from '@Contexts/Security/Domain/Auth/Exceptions/InvalidCredentialsException';

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
  });

  describe('persistence round-trip', () => {
    it('gives back an equal account after toSnapshot / fromSnapshot, without events', () => {
      const account = aPendingAccount();
      account.validate();
      account.authenticate(new Date('2026-01-01T10:00:00Z'));

      const rebuilt = Account.fromSnapshot(account.toSnapshot());

      expect(rebuilt.equals(account)).toBe(true);
      expect(rebuilt.toSnapshot()).toEqual(account.toSnapshot());
      expect(rebuilt.pullDomainEvents()).toEqual([]);
    });
  });
});
