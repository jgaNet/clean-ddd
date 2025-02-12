import { GetUsersQueryResult } from '@Contexts/UsersManager/Application/DTOs';
import { QueryHandler } from '@Primitives/QueryHandler';
import { Result } from '@Primitives/Result';
import { IUserQueries } from '@Contexts/UsersManager/Domain/User/Ports/IUserQueries';

export class GetUsersQuery extends QueryHandler<IUserQueries, void, GetUsersQueryResult> {
  async execute(): Promise<GetUsersQueryResult> {
    return Result.ok(await this.queriesService.findAll());
  }
}
