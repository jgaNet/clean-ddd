import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';
import { ITrackedOperation } from '@Contexts/Tracker/Domain/TrackedOperation';

export class InMemoryOperationRepository {
  dataSource: InMemoryDataSource<ITrackedOperation>;

  constructor(dataSource: InMemoryDataSource<ITrackedOperation>) {
    this.dataSource = dataSource;
  }

  async save(operation: ITrackedOperation) {
    this.dataSource.collection.set(operation.id, operation);
  }
}
