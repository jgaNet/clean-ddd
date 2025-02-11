import { DataSource } from '@Primitives/DataSource';
export abstract class QueriesService<T extends DataSource<unknown>> {
  abstract dataSource: T;
}
