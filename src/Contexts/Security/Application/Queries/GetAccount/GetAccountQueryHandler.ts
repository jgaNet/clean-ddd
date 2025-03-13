import { QueryHandler, Result, IResult } from '@Primitives/Application';
import { IAccountQueries } from '@Contexts/Security/Domain/Account/Ports/IAccountQueries';
import { IAccount } from '@Contexts/Security/Domain/Account/DTOs';

export class GetAccountQueryHandler extends QueryHandler<IAccountQueries, string, IResult<IAccount>> {
  constructor(private accountQueries: IAccountQueries) {
    super(accountQueries);
  }

  async execute(id: string): Promise<IResult<IAccount>> {
    try {
      const account = await this.accountQueries.findById(id);

      if (!account) {
        return Result.fail(new Error(`Account with ID ${id} not found`));
      }

      return Result.ok(account);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error('Error getting account'));
    }
  }
}
