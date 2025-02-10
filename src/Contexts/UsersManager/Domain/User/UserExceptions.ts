import { Exception } from '@Primitives/Exception';

export class UserDomainException extends Exception {
  constructor({ type, message, context }: { type: string; message: string; context?: unknown }) {
    super({ service: 'core.domain.users-manager', type, message, context });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const UserExceptions: Record<string, (infos: any) => UserDomainException> = {
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
