import { GetUsersQueryResult } from '@Contexts/UsersManager/Application/DTOs';
import { QueryHandler } from '@Primitives/QueryHandler';
import { DataSource } from '@Primitives/DataSource';
import Result from '@Primitives/Result';
import { UserDTO } from '@Contexts/UsersManager/Domain/User/DTOs';

export class GetUsersQuery extends QueryHandler<DataSource<UserDTO>, void, GetUsersQueryResult> {
  static name = Symbol('GetUsers');

  async execute(): Promise<Result<GetUsersQueryResult>> {
    return Result.ok<GetUsersQueryResult>([...this.dataSource.collection.values()]);
  }
}
