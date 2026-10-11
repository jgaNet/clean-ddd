import { UnitOfWork } from '@Architecture/Application';
import { InMemoryDataSource } from '@Architecture/Infrastructure/DataSources/InMemoryDataSource';

/**
 * The transaction boundary over the in-memory stores. `beginTransaction()` snapshots every
 * InMemoryDataSource of the process, `commitTransaction()` drops the snapshots, and
 * `rollbackTransaction()` puts the stores back as they were: after a rollback, nothing the
 * transaction saved remains, which is what ExecutionContext.withTransaction() promises.
 *
 * Honest limit: the snapshot is of the whole store, so two transactions interleaving writes
 * are not isolated from each other — a rollback undoes everything written since it began,
 * including another request's work. Undoing only its own writes would need the store to know
 * which request is writing, which needs request-scoped propagation (AsyncLocalStorage); that
 * is machinery this reference declines, so what these four methods give you is a transaction
 * *boundary*, not isolation. A database gives both, through the same four methods
 * (docs/adr/0003-publish-domain-events-after-commit.md). One instance per request: see the
 * bootstrap.
 */
export class InMemoryUnitOfWork implements UnitOfWork {
  #restore: (() => void)[] | null = null;

  constructor(private stores: Iterable<InMemoryDataSource<unknown>> = InMemoryDataSource.all) {}

  async beginTransaction(): Promise<void> {
    if (this.#restore) {
      throw new Error('Transaction already in progress');
    }
    this.#restore = [...this.stores].map(store => store.snapshot());
  }

  async commitTransaction(): Promise<void> {
    if (!this.#restore) {
      throw new Error('No active transaction to commit');
    }
    this.#restore = null;
  }

  async rollbackTransaction(): Promise<void> {
    if (!this.#restore) {
      throw new Error('No active transaction to rollback');
    }
    this.#restore.forEach(restore => restore());
    this.#restore = null;
  }

  hasActiveTransaction(): boolean {
    return this.#restore !== null;
  }
}
