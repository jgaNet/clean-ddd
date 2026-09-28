import { IResult, Result } from '@SharedKernel/Domain';
import { Email } from '@SharedKernel/Domain/ValueObjects';

import { Account } from '@Contexts/Security/Domain/Account/Account';
import { INewAccount } from '@Contexts/Security/Domain/Account/DTOs';
import { IAccountRepository } from '@Contexts/Security/Domain/Account/Ports/IAccountRepository';
import { AccountAlreadyExistsException } from '@Contexts/Security/Domain/Account/AccountExceptions';

/**
 * AccountRegistration is a domain service: it holds a business rule that no single
 * aggregate can enforce on its own. "An email identifies at most one account" is a
 * statement about the whole collection of accounts, so it needs the repository. It is
 * still domain code: it depends on the port, not on any implementation, and it carries
 * no application concern (no logging, no transaction, no event publishing).
 */
export class AccountRegistration {
  constructor(private accounts: IAccountRepository) {}

  async register(props: INewAccount): Promise<IResult<Account>> {
    const email = Email.create(props.email);
    if (email.isFailure()) return email;

    if (await this.accounts.findByEmail(email.data.value)) {
      return Result.fail(new AccountAlreadyExistsException(email.data.value));
    }

    return Account.register(props);
  }
}
