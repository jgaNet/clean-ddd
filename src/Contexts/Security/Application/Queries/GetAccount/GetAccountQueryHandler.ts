import { IResult, NotAllowedException, NotFoundException, Result, Role } from '@SharedKernel/Domain';
import { ExecutionContext, QueryHandler } from '@SharedKernel/Application';

import { AccountDetail, IAccountQueries } from '@Contexts/Security/Domain/Account/Ports/IAccountQueries';

/** A user may read their own account; an administrator may read any. */
export class GetAccountQueryHandler extends QueryHandler<IAccountQueries, string, IResult<AccountDetail>> {
  protected async guard(id: string, { auth }: ExecutionContext): Promise<IResult<unknown>> {
    if (!auth.role || auth.role === Role.GUEST) {
      return Result.fail(new NotAllowedException('Security', 'Authentication required'));
    }
    if (auth.role === Role.USER && auth.subjectId !== id) {
      return Result.fail(new NotAllowedException('Security', 'Not Allowed'));
    }
    return Result.ok();
  }

  async execute(id: string): Promise<IResult<AccountDetail>> {
    const account = await this.queries.findById(id);
    if (!account) return Result.fail(new NotFoundException('Security', 'Account not found'));

    return Result.ok(account);
  }
}
