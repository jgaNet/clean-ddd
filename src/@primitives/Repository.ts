import { DataSource } from '@primitives/DataSource';
export abstract class Repository {
  abstract dataSource: DataSource;
}
