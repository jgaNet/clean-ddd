import { IAuthQueries } from '@Contexts/Security/Domain/Auth/Ports/IAuthQueries';
import { IAuth } from '@Contexts/Security/Domain/Auth/DTOs';
import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';
import { Auth } from '@Contexts/Security/Domain/Auth/Auth';
import { AuthMapper } from '@Contexts/Security/Domain/Auth/AuthMapper';

export class InMemoryAuthQueries implements IAuthQueries {
  dataSource: InMemoryDataSource<Auth>;
  private mapper: AuthMapper;

  constructor(dataSource: InMemoryDataSource<Auth>) {
    this.dataSource = dataSource;
    this.mapper = new AuthMapper();
  }

  async findBySubject(subjectId: string, subjectType: string): Promise<IAuth | null> {
    const auths = Array.from(this.dataSource.collection.values());
    const auth = auths.find(auth => auth.subjectId === subjectId && auth.subjectType === subjectType);
    return auth ? this.mapper.toJSON(auth) : null;
  }

  async findById(id: string): Promise<IAuth | null> {
    const auth = this.dataSource.collection.get(id);
    return auth ? this.mapper.toJSON(auth) : null;
  }

  async findAll(options?: { limit?: number; offset?: number }): Promise<IAuth[]> {
    const { limit = 10, offset = 0 } = options || {};
    const auths = Array.from(this.dataSource.collection.values());
    return auths.slice(offset, offset + limit).map(auth => this.mapper.toJSON(auth));
  }

  async findByCredentialType(type: string, options?: { limit?: number; offset?: number }): Promise<IAuth[]> {
    const { limit = 10, offset = 0 } = options || {};
    const auths = Array.from(this.dataSource.collection.values());
    return auths
      .filter(auth => auth.credentials.type === type)
      .slice(offset, offset + limit)
      .map(auth => this.mapper.toJSON(auth));
  }

  async count(): Promise<number> {
    return this.dataSource.collection.size;
  }
}
