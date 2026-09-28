import { IResult, NotAllowedException, Result, Role } from '@SharedKernel/Domain';
import { CommandHandler, ExecutionContext } from '@SharedKernel/Application';

import { AccountRegistration } from '@Contexts/Security/Domain/Account/AccountRegistration';
import { IAccountRepository } from '@Contexts/Security/Domain/Account/Ports/IAccountRepository';
import { IPasswordHasher } from '@Contexts/Security/Domain/Auth/Ports/IPasswordHasher';
import { RegisterAdminCommandEvent } from './RegisterAdminCommandEvent';

/** Reserved to administrators (and to the bootstrap, acting as the system). The account is usable at once. */
export class RegisterAdminCommandHandler extends CommandHandler<RegisterAdminCommandEvent> {
  constructor(
    private accountRepository: IAccountRepository,
    private accountRegistration: AccountRegistration,
    private passwordHasher: IPasswordHasher,
  ) {
    super();
  }

  protected async guard(_: RegisterAdminCommandEvent, { auth }: ExecutionContext): Promise<IResult<unknown>> {
    if (auth.role !== Role.ADMIN) {
      return Result.fail(new NotAllowedException('Security', 'Only an administrator can register another one'));
    }
    return Result.ok();
  }

  async execute({ payload }: RegisterAdminCommandEvent, context: ExecutionContext): Promise<IResult<string>> {
    const account = await this.accountRegistration.register({
      email: payload.email,
      role: Role.ADMIN,
      passwordHash: await this.passwordHasher.hash(payload.password),
      activated: true,
    });
    if (account.isFailure()) return account;

    await this.accountRepository.save(account.data);
    this.publishDomainEvents(account.data, context);

    return Result.ok(account.data._id.value);
  }
}
