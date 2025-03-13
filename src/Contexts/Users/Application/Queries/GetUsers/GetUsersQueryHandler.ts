import { Role } from '@SharedKernel/Domain/AccessControl';

import { GetUsersQueryResult } from '@Contexts/Users/Application/DTOs';
import { QueryHandler, Result, IResult, ExecutionContext, NotAllowedException } from '@SharedKernel/Domain/Application';
import { IUserQueries } from '@Contexts/Users/Domain/User/Ports/IUserQueries';

export class GetUsersQueryHandler extends QueryHandler<IUserQueries, void, GetUsersQueryResult> {
  protected async guard(_: never, { auth }: ExecutionContext): Promise<IResult> {
    if (!auth.role || ![Role.USER, Role.ADMIN].includes(auth.role)) {
      return Result.fail(new NotAllowedException('Users', 'Forbidden'));
    }
    return Result.ok();
  }

  async execute(_: void): Promise<GetUsersQueryResult> {
    const users = await this.queriesService.findAll();
    return Result.ok(users);
  }
}
