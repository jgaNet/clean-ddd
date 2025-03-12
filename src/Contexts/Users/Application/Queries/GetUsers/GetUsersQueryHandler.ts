import { GetUsersQueryResult } from '@Contexts/Users/Application/DTOs';
import { QueryHandler } from '@Primitives/QueryHandler';
import { Result } from '@Primitives/Result';
import { IUserQueries } from '@Contexts/Users/Domain/User/Ports/IUserQueries';
import { ExecutionContext } from '@Primitives/ExecutionContext';
import { NotAllowedException } from '@Primitives/Exception';
import { Role } from '@Primitives';

export class GetUsersQueryHandler extends QueryHandler<IUserQueries, void, GetUsersQueryResult> {
  async execute(_: void, { auth }: ExecutionContext): Promise<GetUsersQueryResult> {
    if (!auth.role || ![Role.USER, Role.ADMIN].includes(auth.role)) {
      return Result.fail(new NotAllowedException('Users', 'Forbidden'));
    }

    const users = await this.queriesService.findAll();
    return Result.ok(users);
  }
}
