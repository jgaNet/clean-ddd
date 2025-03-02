import { InMemoryDataSource } from '@Shared/Infrastructure/DataSources/InMemoryDataSource';
import { IOperation } from '@Contexts/OperationsManager/Domain/Operation';

export class InMemoryOperationRepository {
  dataSource: InMemoryDataSource<IOperation>;

  constructor(dataSource: InMemoryDataSource<IOperation>) {
    this.dataSource = dataSource;
  }

  async save(operation: IOperation) {
    this.dataSource.collection.set(operation.id, operation);
  }
}
