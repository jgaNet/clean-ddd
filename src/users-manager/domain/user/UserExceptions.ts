import { Exception } from '@primitives/Exception';

class UserDomainException extends Exception {
  constructor({ type, message, context }: { type: string; message: string; context?: unknown }) {
    super({ service: 'core.domain.user', type, message, context });
  }
}

export const UserExceptions: Record<string, (infos: any) => Error> = {
  UserWithEmailAlreadyExists: ({ email }: { email: string }) =>
    new UserDomainException({
      type: 'UserWithEmailAlreadyExists',
      message: 'User already exists',
      context: {
        email,
      },
    }),
  InvalidUserEmail: ({ email }: { email: string }) =>
    new UserDomainException({
      type: 'InvalidUserEmail',
      message: 'Invalid user email',
      context: {
        email,
      },
    }),
};
