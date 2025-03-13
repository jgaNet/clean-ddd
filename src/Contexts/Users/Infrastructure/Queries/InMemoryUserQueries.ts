import { IUserQueries } from '@Contexts/Users/Domain/User/Ports/IUserQueries';
import { IUser } from '@Contexts/Users/Domain/User/DTOs';
import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';
import { Nullable } from '@SharedKernel/Domain/Utils';

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
