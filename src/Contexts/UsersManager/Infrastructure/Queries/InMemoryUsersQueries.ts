import { UserDTO } from '@Contexts/UsersManager/Domain/User/DTOs';
import { GetUsersQueryResult } from '@Contexts/UsersManager/Application/DTOs';
import { InMemoryDataSource } from '@Shared/Infrastructure/DataSources/InMemoryDataSource';
import { QueryHandler } from '@Primitives/QueryHandler';
import Result from '@Primitives/Result';

export class GetUsersQuery extends QueryHandler<InMemoryDataSource<UserDTO>> {
  async execute(): Promise<Result<GetUsersQueryResult>> {
    return Result.ok<GetUsersQueryResult>([...this.dataSource.collection.values()]);
  }
}
