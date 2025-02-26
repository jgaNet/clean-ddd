import { Event } from '@Primitives';
import { InMemoryDataSource } from '@Shared/Infrastructure/DataSources/InMemoryDataSource';
import { Operation, IOperation } from '@Shared/Domain/Operation';

export class InMemoryOperationRepository {
  dataSource: InMemoryDataSource<IOperation>;

  constructor(dataSource: InMemoryDataSource<IOperation>) {
    this.dataSource = dataSource;
  }

  async save(operation: Operation<Event<unknown>>) {
    this.dataSource.collection.set(operation.id, operation.toJSON());
  }
}
