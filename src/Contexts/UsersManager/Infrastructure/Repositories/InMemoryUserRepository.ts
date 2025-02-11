import { IUserRepository } from '@Contexts/UsersManager/Domain/User/Ports/IUserRepository';
import { IUser } from '@Contexts/UsersManager/Domain/User/DTOs';
import { InMemoryDataSource } from '@Shared/Infrastructure/DataSources/InMemoryDataSource';
import { Nullable } from '@Primitives/Nullable';
import { v4 as uuidv4 } from 'uuid';

export class InMemoryUserRepository implements IUserRepository {
  dataSource: InMemoryDataSource<IUser>;

  constructor(dataSource: InMemoryDataSource<IUser>) {
    this.dataSource = dataSource;
  }

  async nextIdentity(): Promise<string> {
    return uuidv4();
  }

  async findByEmail(email: string): Promise<Nullable<IUser>> {
    return [...this.dataSource.collection.values()].find(user => user.profile.email === email) || null;
  }

  async save(user: IUser) {
    this.dataSource.collection.set(user._id, user);
  }

  async findById(id: string): Promise<Nullable<IUser>> {
    return this.dataSource.collection.get(id) || null;
  }
}
