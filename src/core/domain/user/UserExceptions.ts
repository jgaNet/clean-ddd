export const UserExceptions: Record<string, Error> = {
  UserWithEmailAlreadyExists: new Error('User already exists'),
  InvalidUserEmail: new Error('Invalid user email'),
};
