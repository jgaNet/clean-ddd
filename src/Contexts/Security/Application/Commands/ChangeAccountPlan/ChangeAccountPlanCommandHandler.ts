import { IResult, NotAllowedException, Result, Role } from '@SharedKernel/Domain';
import { CommandHandler, ExecutionContext } from '@SharedKernel/Application';

import { IAccountRepository } from '@Contexts/Security/Domain/Account/Ports/IAccountRepository';
import { AccountNotFoundException } from '@Contexts/Security/Domain/Account/AccountExceptions';
import { ChangeAccountPlanCommandEvent } from './ChangeAccountPlanCommandEvent';

/**
 * Reserved to administrators: a role-only rule, so it is the guard's. Which plan an account
 * may move to is the aggregate's business (`Account.changePlan()`).
 */
export class ChangeAccountPlanCommandHandler extends CommandHandler<ChangeAccountPlanCommandEvent> {
  constructor(private accountRepository: IAccountRepository) {
    super();
  }

  protected async guard(_: ChangeAccountPlanCommandEvent, { auth }: ExecutionContext): Promise<IResult<unknown>> {
    if (auth.role !== Role.ADMIN) {
      return Result.fail(new NotAllowedException('Security', "Only an administrator can change an account's plan"));
    }
    return Result.ok();
  }

  async execute({ payload }: ChangeAccountPlanCommandEvent, context: ExecutionContext): Promise<IResult> {
    const account = await this.accountRepository.findById(payload.accountId);
    if (!account) return Result.fail(new AccountNotFoundException(payload.accountId));

    const changed = account.changePlan(payload.plan);
    if (changed.isFailure()) return changed;

    await this.accountRepository.save(account);
    this.publishDomainEvents(account, context);

    return Result.ok();
  }
}
