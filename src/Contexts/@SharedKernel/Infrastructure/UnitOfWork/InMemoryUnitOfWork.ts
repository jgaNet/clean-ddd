import { UnitOfWork } from '@SharedKernel/Application';

/**
 * A unit of work with nothing to commit: the in-memory stores write immediately. What it
 * does provide is the transaction *boundary* the ExecutionContext relies on (begin, commit
 * or roll back, exactly once, one at a time), so that `afterCommit` has a commit to wait
 * for. A database adapter would open and close a real transaction in these same four methods.
 *
 * One instance per request: see the bootstrap.
 */
export class InMemoryUnitOfWork implements UnitOfWork {
  #active = false;

  async beginTransaction(): Promise<void> {
    if (this.#active) {
      throw new Error('Transaction already in progress');
    }
    this.#active = true;
  }

  async commitTransaction(): Promise<void> {
    if (!this.#active) {
      throw new Error('No active transaction to commit');
    }
    this.#active = false;
  }

  async rollbackTransaction(): Promise<void> {
    if (!this.#active) {
      throw new Error('No active transaction to rollback');
    }
    this.#active = false;
  }

  hasActiveTransaction(): boolean {
    return this.#active;
  }
}
