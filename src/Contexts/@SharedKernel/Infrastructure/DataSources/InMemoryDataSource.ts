/**
 * A Map used as a database. Repositories and queries of a context share one instance,
 * which is all the "persistence" this reference project needs: the ports they implement
 * are what a real database adapter would implement instead.
 */
export class InMemoryDataSource<Model> {
  collection = new Map<string, Model>();
  resetCollection = () => (this.collection = new Map<string, Model>());
}
