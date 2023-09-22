import { UserDTO } from '@users-manager/domain/user/dtos';
import { InMemoryUserRepository } from 'users-manager/infrastructure/adapters/repositories/InMemoryUserRepository';

export class GetUsersQuery {
  execute(): UserDTO[] {
    return [...InMemoryUserRepository.collection.values()];
  }
}
