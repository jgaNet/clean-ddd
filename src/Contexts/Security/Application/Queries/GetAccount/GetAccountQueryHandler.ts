import { QueryHandler, Result, IResult, ExecutionContext, NotAllowedException } from '@SharedKernel/Domain/Application';
import { IAccountQueries } from '@Contexts/Security/Domain/Account/Ports/IAccountQueries';
import { IAccount } from '@Contexts/Security/Domain/Account/DTOs';
import { NotFoundException, Role } from '@Contexts/@SharedKernel/Domain';

export class GetAccountQueryHandler extends QueryHandler<IAccountQueries, string, IResult<IAccount>> {
  constructor(private accountQueries: IAccountQueries) {
    super(accountQueries);
  }

  protected async guard(id: string, context?: ExecutionContext): Promise<IResult> {
    if (!context?.auth || context?.auth.role === Role.GUEST) {
      return Result.fail(new NotAllowedException('Security', 'Authentication required'));
    }

    if (context?.auth.role === Role.USER && context?.auth.subjectId !== id) {
      return Result.fail(new NotAllowedException('Security', 'Not Allowed'));
    }

    return Result.ok();
  }

  async execute(id: string): Promise<IResult<IAccount>> {
    try {
      const account = await this.accountQueries.findById(id);

      if (!account) {
        return Result.fail(new NotFoundException('Security', 'Account not found'));
      }

      return Result.ok(account);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error('Error getting account'));
    }
  }
}
