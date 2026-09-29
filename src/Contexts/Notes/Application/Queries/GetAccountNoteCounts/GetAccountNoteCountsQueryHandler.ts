import { IResult, NotAllowedException, Result, Role } from '@SharedKernel/Domain';
import { ExecutionContext, QueryHandler } from '@SharedKernel/Application';

import { AccountNoteCounts, INoteQueries } from '@Contexts/Notes/Domain/Note/Ports/INoteQueries';

/**
 * Reserved to administrators: how many notes an account owns and how many are shared with it.
 * "Administrators only" needs no caller Id, so it is a `guard()` and not a `requireSignedIn()`
 * (see Guards.ts). The account itself belongs to Security; Notes answers for any id it is given.
 */
export class GetAccountNoteCountsQueryHandler extends QueryHandler<INoteQueries, string, IResult<AccountNoteCounts>> {
  protected async guard(_: string, { auth }: ExecutionContext): Promise<IResult<unknown>> {
    if (auth.role !== Role.ADMIN) {
      return Result.fail(new NotAllowedException('Notes', 'Only an administrator can count the notes of an account'));
    }
    return Result.ok();
  }

  async execute(accountId: string): Promise<IResult<AccountNoteCounts>> {
    return Result.ok(await this.queries.countByAccount(accountId));
  }
}
