import { IUserQueries } from '@Contexts/UsersManager/Domain/User/Ports/IUserQueries';
import { IUser } from '@Contexts/UsersManager/Domain/User/DTOs';
import { InMemoryDataSource } from '@Shared/Infrastructure/DataSources/InMemoryDataSource';
import { Nullable } from '@Primitives/Nullable';

export class InMemoryUserQueries implements IUserQueries {
  dataSource: InMemoryDataSource<IUser>;

  constructor(dataSource: InMemoryDataSource<IUser>) {
    this.dataSource = dataSource;
  }

  async findByEmail(email: string): Promise<Nullable<IUser>> {
    return [...this.dataSource.collection.values()].find(user => user.profile.email === email) || null;
  }

  async findById(id: string): Promise<Nullable<IUser>> {
    return this.dataSource.collection.get(id) || null;
  }

  async findAll(): Promise<IUser[]> {
    return [...this.dataSource.collection.values()];
  }
}
