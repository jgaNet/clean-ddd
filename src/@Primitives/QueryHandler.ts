import { QueriesService } from '@Primitives/QueriesService';
import { DataSource } from '@Primitives/DataSource';
import Result from './Result';

export abstract class QueryHandler<T extends QueriesService<DataSource<unknown>>, P, R extends Result<unknown>> {
  protected queriesService: T;

  constructor(queriesService: T) {
    this.queriesService = queriesService;
  }

  abstract execute(payload: P): Promise<R>;
}
