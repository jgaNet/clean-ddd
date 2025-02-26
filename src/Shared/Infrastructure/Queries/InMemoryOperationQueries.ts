import { IOperationQueries } from '@Shared/Domain/Operation/Ports/IOperationQueries';
import { IOperation } from '@Shared/Domain/Operation';
import { InMemoryDataSource } from '@Shared/Infrastructure/DataSources/InMemoryDataSource';
import { Nullable } from '@Primitives/Nullable';

export class InMemoryOperationQueries implements IOperationQueries {
  dataSource: InMemoryDataSource<IOperation>;

  constructor(dataSource: InMemoryDataSource<IOperation>) {
    this.dataSource = dataSource;
  }

  async findById(id: string): Promise<Nullable<IOperation>> {
    return this.dataSource.collection.get(id) || null;
  }

  async findAll(): Promise<IOperation[]> {
    return [...this.dataSource.collection.values()];
  }
}
