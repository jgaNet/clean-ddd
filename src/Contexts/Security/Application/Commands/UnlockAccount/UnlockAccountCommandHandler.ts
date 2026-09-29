import { IResult, NotAllowedException, Result, Role } from '@SharedKernel/Domain';
import { CommandHandler, ExecutionContext } from '@SharedKernel/Application';

import { IAccountRepository } from '@Contexts/Security/Domain/Account/Ports/IAccountRepository';
import { AccountNotFoundException } from '@Contexts/Security/Domain/Account/AccountExceptions';
import { UnlockAccountCommandEvent } from './UnlockAccountCommandEvent';

/** Reserved to administrators: lifts the lock a run of wrong passwords put on an account. */
export class UnlockAccountCommandHandler extends CommandHandler<UnlockAccountCommandEvent> {
  constructor(private accountRepository: IAccountRepository) {
    super();
  }

  protected async guard(_: UnlockAccountCommandEvent, { auth }: ExecutionContext): Promise<IResult<unknown>> {
    if (auth.role !== Role.ADMIN) {
      return Result.fail(new NotAllowedException('Security', 'Only an administrator can unlock an account'));
    }
    return Result.ok();
  }

  async execute({ payload }: UnlockAccountCommandEvent, context: ExecutionContext): Promise<IResult<string>> {
    const account = await this.accountRepository.findById(payload.accountId);
    if (!account) return Result.fail(new AccountNotFoundException(payload.accountId));

    const unlocked = account.unlock();
    if (unlocked.isFailure()) return unlocked;

    await this.accountRepository.save(account);
    this.publishDomainEvents(account, context);

    return Result.ok(account._id.value);
  }
}
