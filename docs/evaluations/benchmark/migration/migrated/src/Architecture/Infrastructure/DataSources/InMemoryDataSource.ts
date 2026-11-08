/**
 * A Map used as a database. Repositories and queries of a context share one instance,
 * which is all the "persistence" this reference project needs: the ports they implement
 * are what a real database adapter would implement instead.
 *
 * Every instance registers itself, so that the in-memory unit of work can snapshot all the
 * stores of the process when a transaction begins and put them back if it rolls back. A
 * database would keep that undo log itself; here the store does.
 */
export class InMemoryDataSource<Model> {
  static readonly all = new Set<InMemoryDataSource<unknown>>();

  collection = new Map<string, Model>();

  constructor() {
    InMemoryDataSource.all.add(this);
  }

  resetCollection = () => (this.collection = new Map<string, Model>());

  /** A copy of the store as it is now, and the way to put it back. */
  snapshot(): () => void {
    const copy = new Map(this.collection);
    return () => {
      this.collection = new Map(copy);
    };
  }
}
