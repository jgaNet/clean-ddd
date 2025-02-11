import { DataSource } from '@Primitives/DataSource';
export abstract class Repository<T> {
  abstract dataSource: DataSource<T>;
}
