export abstract class DataSource<T> {
  abstract collection: Map<string, T>;
  abstract resetCollection(): void;
}
