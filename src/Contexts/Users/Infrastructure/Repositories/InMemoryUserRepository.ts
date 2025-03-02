import { IUserRepository } from '@Contexts/Users/Domain/User/Ports/IUserRepository';
import { IUser } from '@Contexts/Users/Domain/User/DTOs';
import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';
import { v4 as uuidv4 } from 'uuid';

export class InMemoryUserRepository implements IUserRepository {
  dataSource: InMemoryDataSource<IUser>;

  constructor(dataSource: InMemoryDataSource<IUser>) {
    this.dataSource = dataSource;
  }

  async nextIdentity(): Promise<string> {
    return uuidv4();
  }

  async save(user: IUser) {
    this.dataSource.collection.set(user._id, user);
  }
}
