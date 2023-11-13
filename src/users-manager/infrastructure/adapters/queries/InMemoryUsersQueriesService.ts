import { UserDTO } from 'users-manager/domain/user/dtos';
import { inMemoryDataSource } from 'users-manager/infrastructure/data-sources/InMemoryDataSource';

export class GetUsersQuery {
  execute(): UserDTO[] {
    return [...inMemoryDataSource.collection.values()] as UserDTO[];
  }
}
