import { DataSource } from './DataSource';
import Result from './Result';

export abstract class QueryHandler<T extends DataSource<unknown>, P = unknown, R = unknown> {
  dataSource: T;

  constructor(dataSource: T) {
    this.dataSource = dataSource;
  }

  abstract execute(payload: P): Promise<Result<R>>;
}
