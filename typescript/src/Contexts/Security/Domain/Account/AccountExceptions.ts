import { Exception } from '@Architecture/Domain';

/**
 * Domain exceptions of the Account aggregate: a broken business rule, in business words.
 * They are carried by Result.fail(), never thrown. One file per aggregate; the `type` is
 * the PascalCase name of the rule, as a client reads it on the operation.
 */
export class AccountDomainException extends Exception {
  constructor({ type, message, context }: { type: string; message: string; context?: unknown }) {
    super({ service: 'Security', type, message, context });
  }
}

export class AccountAlreadyExistsException extends AccountDomainException {
  constructor(email: string) {
    super({ type: 'AccountAlreadyExists', message: 'An account already exists for this email', context: { email } });
  }
}

export class AccountNotFoundException extends AccountDomainException {
  constructor(accountId: string) {
    super({ type: 'AccountNotFound', message: 'Account not found', context: { accountId } });
  }
}

export class AccountAlreadyActiveException extends AccountDomainException {
  constructor(accountId: string) {
    super({ type: 'AccountAlreadyActive', message: 'This account is already active', context: { accountId } });
  }
}

export class InactiveAccountException extends AccountDomainException {
  constructor(accountId: string) {
    super({ type: 'InactiveAccount', message: 'This account is not active', context: { accountId } });
  }
}

/** Deliberately vague: it does not say whether the email or the password was wrong. */
export class InvalidCredentialsException extends AccountDomainException {
  constructor() {
    super({ type: 'InvalidCredentials', message: 'Invalid credentials' });
  }
}
