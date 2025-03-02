import { GetUsersQueryResult } from '@Contexts/Users/Application/DTOs';
import { QueryHandler } from '@Primitives/QueryHandler';
import { Result } from '@Primitives/Result';
import { IUserQueries } from '@Contexts/Users/Domain/User/Ports/IUserQueries';

export class GetUsersQueryHandler extends QueryHandler<IUserQueries, void, GetUsersQueryResult> {
  async execute(): Promise<GetUsersQueryResult> {
    const users = await this.queriesService.findAll();
    return Result.ok(users);
  }
}
