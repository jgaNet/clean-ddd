import { Exception } from '@primitives/Exception';

class UserDomainException extends Exception {
  constructor({ type, message }: { type: string; message: string }) {
    super({ service: 'core.domain.user', type, message });
  }
}

export const UserExceptions: Record<string, Error> = {
  UserWithEmailAlreadyExists: new UserDomainException({
    type: 'UserWithEmailAlreadyExists',
    message: 'User already exists',
  }),
  InvalidUserEmail: new UserDomainException({
    type: 'InvalidUserEmail',
    message: 'Invalid user email',
  }),
};
