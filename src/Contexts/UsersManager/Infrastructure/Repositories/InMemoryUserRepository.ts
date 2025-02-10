import { UserRepository } from '@users-manager/domain/user/UserRepository';
import { UserDTO } from '@users-manager/domain/user/dtos';
import { v4 as uuidv4 } from 'uuid';
import { InMemoryDataSource } from '@users-manager/infrastructure/data-sources/InMemoryDataSource';

export class InMemoryUserRepository implements UserRepository {
  dataSource: InMemoryDataSource<UserDTO>;

  constructor(dataSource: InMemoryDataSource<UserDTO>) {
    this.dataSource = dataSource;
  }

  async nextIdentity(): Promise<string> {
    return uuidv4();
  }

  async findByEmail(email: string): Promise<UserDTO | null> {
    return [...this.dataSource.collection.values()].find(user => user.profile.email === email) || null;
  }

  async save(user: UserDTO) {
    this.dataSource.collection.set(user._id, user);
  }

  async findById(id: string): Promise<UserDTO | null> {
    return this.dataSource.collection.get(id) || null;
  }
}
