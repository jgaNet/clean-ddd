import { IResult, Result, ValueObject } from '@Architecture/Domain';

import { PasswordTooShortException } from '@Contexts/Security/Domain/Account/AccountExceptions';

/**
 * A password as the user typed it, before it is hashed. It exists only long enough to be
 * checked and handed to the IPasswordHasher port: the aggregate stores Credentials (a hash),
 * never a Password. The rule it protects, "at least MIN_LENGTH characters", is about the
 * clear text, so it has to be checked here, before hashing erases the length.
 */
export class Password extends ValueObject<string> {
  static readonly MIN_LENGTH = 8;

  private constructor(password: string) {
    super(password);
  }

  static create(raw: string): IResult<Password> {
    if (raw.length < Password.MIN_LENGTH) {
      return Result.fail(new PasswordTooShortException(Password.MIN_LENGTH));
    }

    return Result.ok(new Password(raw));
  }
}
