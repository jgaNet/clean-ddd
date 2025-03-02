import { Exception } from '@Primitives/Exception';

export class UserDomainException extends Exception {
  constructor({ type, message, context }: { type: string; message: string; context?: unknown }) {
    super({ service: 'contexts.users-manager', type, message, context });
  }
}

export class UserWithEmailAlreadyExists extends UserDomainException {
  constructor({ email }: { email: string }) {
    super({ type: 'UserWithEmailAlreadyExists', message: 'User already exists', context: { email } });
  }
}

export class InvalidUserEmail extends UserDomainException {
  constructor({ email }: { email: string }) {
    super({ type: 'InvalidUserEmail', message: 'Invalid user email', context: { email } });
  }
}
