import { Event } from '@Primitives';
import { InMemoryDataSource } from '@Shared/Infrastructure/DataSources/InMemoryDataSource';
import { Operation, IOperation } from '@Shared/Domain/Operation';
import { OperationMapper } from '@Shared/Domain/Operation/OperationMapper';

export class InMemoryOperationRepository {
  dataSource: InMemoryDataSource<IOperation>;

  constructor(dataSource: InMemoryDataSource<IOperation>) {
    this.dataSource = dataSource;
  }

  async save(operation: IOperation) {
    this.dataSource.collection.set(operation.id, operation);
  }
}
