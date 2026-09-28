import { IResult, Result, Role } from '@SharedKernel/Domain';
import { CommandHandler, ExecutionContext } from '@SharedKernel/Application';

import { AccountRegistration } from '@Contexts/Security/Domain/Account/AccountRegistration';
import { IAccountRepository } from '@Contexts/Security/Domain/Account/Ports/IAccountRepository';
import { IPasswordHasher } from '@Contexts/Security/Domain/Auth/Ports/IPasswordHasher';
import { SignUpCommandEvent } from './SignUpCommandEvent';

/**
 * Self-registration: anyone may sign up, the account stays PENDING until the email is
 * validated (see AccountCreatedHandler, which sends the validation token).
 */
export class SignUpCommandHandler extends CommandHandler<SignUpCommandEvent> {
  constructor(
    private accountRepository: IAccountRepository,
    private accountRegistration: AccountRegistration,
    private passwordHasher: IPasswordHasher,
  ) {
    super();
  }

  async execute({ payload }: SignUpCommandEvent, context: ExecutionContext): Promise<IResult<string>> {
    const account = await this.accountRegistration.register({
      email: payload.email,
      role: Role.USER,
      passwordHash: await this.passwordHasher.hash(payload.password),
      activated: false,
    });
    if (account.isFailure()) return account;

    await this.accountRepository.save(account.data);
    this.publishDomainEvents(account.data, context);

    return Result.ok(account.data._id.value);
  }
}
