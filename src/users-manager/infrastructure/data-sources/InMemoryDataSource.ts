import { DataSource } from '@primitives/DataSource';

export class InMemoryDataSource<Model> extends DataSource {
  collection = new Map<string, Model>();
  resetCollection = () => (this.collection = new Map<string, Model>());
}

export const inMemoryDataSource = new InMemoryDataSource();
