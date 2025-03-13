import { Role } from '@SharedKernel/Domain/AccessControl';

import { GetUsersQueryResult } from '@Contexts/Users/Application/DTOs';
import { QueryHandler, Result, ExecutionContext, NotAllowedException } from '@SharedKernel/Domain/Application';
import { IUserQueries } from '@Contexts/Users/Domain/User/Ports/IUserQueries';

export class GetUsersQueryHandler extends QueryHandler<IUserQueries, void, GetUsersQueryResult> {
  async execute(_: void, { auth }: ExecutionContext): Promise<GetUsersQueryResult> {
    if (!auth.role || ![Role.USER, Role.ADMIN].includes(auth.role)) {
      return Result.fail(new NotAllowedException('Users', 'Forbidden'));
    }

    const users = await this.queriesService.findAll();
    return Result.ok(users);
  }
}
