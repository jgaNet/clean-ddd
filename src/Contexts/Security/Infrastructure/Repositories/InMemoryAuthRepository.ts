import { DataSource } from '@Primitives';
import { Auth } from '@Contexts/Security/Domain/Auth/Auth';
import { IAuthRepository } from '@Contexts/Security/Domain/Auth/Ports/IAuthRepository';
import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';

export class InMemoryAuthRepository implements IAuthRepository {
  dataSource: DataSource<Auth>;

  constructor(dataSource: InMemoryDataSource<Auth>) {
    this.dataSource = dataSource;
  }

  async save(auth: Auth): Promise<void> {
    (this.dataSource as InMemoryDataSource<Auth>).collection.set(auth._id, auth);
  }

  async findById(id: string): Promise<Auth | null> {
    return (this.dataSource as InMemoryDataSource<Auth>).collection.get(id) || null;
  }

  async delete(id: string): Promise<void> {
    (this.dataSource as InMemoryDataSource<Auth>).collection.delete(id);
  }
}
