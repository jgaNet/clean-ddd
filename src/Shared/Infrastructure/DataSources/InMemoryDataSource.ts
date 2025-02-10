import { DataSource } from '@Primitives/DataSource';

export class InMemoryDataSource<Model> extends DataSource<Model> {
  collection = new Map<string, Model>();
  resetCollection = () => (this.collection = new Map<string, Model>());
}
