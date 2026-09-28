import { Exception } from '@SharedKernel/Domain';

/**
 * Domain exceptions of the Account aggregate: a broken business rule, in business words.
 * They are carried by Result.fail(), never thrown.
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
