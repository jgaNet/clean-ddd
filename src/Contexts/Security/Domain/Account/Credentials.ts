import { IResult, Result, ValueObject } from '@SharedKernel/Domain';

import { InvalidCredentialsException } from '@Contexts/Security/Domain/Account/AccountExceptions';

/**
 * What an account authenticates with. The domain only ever sees a hash: hashing and
 * comparing are the job of the IPasswordHasher port, implemented in the infrastructure.
 * The `type` leaves room for other kinds of credentials without touching the aggregate.
 */
export class Credentials extends ValueObject<{ type: 'password'; hash: string }> {
  static create(hash: string): IResult<Credentials> {
    if (!hash) {
      return Result.fail(new InvalidCredentialsException());
    }
    return Result.ok(new Credentials({ type: 'password', hash }));
  }

  get type(): 'password' {
    return this.value.type;
  }

  get hash(): string {
    return this.value.hash;
  }
}
