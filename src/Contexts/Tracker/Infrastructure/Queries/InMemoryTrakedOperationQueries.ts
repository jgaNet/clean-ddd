import { ITrackedOperationQueries } from '@Contexts/Tracker/Domain/TrackedOperation/Ports/ITrackedOperationQueries';
import { ITrackedOperation } from '@Contexts/Tracker/Domain/TrackedOperation';
import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';
import { Nullable } from '@Primitives';

export class InMemoryOperationQueries implements ITrackedOperationQueries {
  dataSource: InMemoryDataSource<ITrackedOperation>;

  constructor(dataSource: InMemoryDataSource<ITrackedOperation>) {
    this.dataSource = dataSource;
  }

  async findById(id: string): Promise<Nullable<ITrackedOperation>> {
    return this.dataSource.collection.get(id) || null;
  }

  async findAll(): Promise<ITrackedOperation[]> {
    return [...this.dataSource.collection.values()];
  }
}
