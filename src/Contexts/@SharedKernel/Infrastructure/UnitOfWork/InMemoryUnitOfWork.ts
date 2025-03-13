import { UnitOfWork } from '@SharedKernel/Domain';

/**
 * In-memory implementation of the UnitOfWork interface.
 *
 * This is a simple implementation for development and testing purposes.
 * In a real application, this would be replaced with a proper transaction
 * manager that works with your database or other persistence mechanisms.
 */
export class InMemoryUnitOfWork implements UnitOfWork {
  #activeTransaction = false;
  #transactionListeners: { commit: (() => Promise<void>)[]; rollback: (() => Promise<void>)[] } = {
    commit: [],
    rollback: [],
  };

  /**
   * Begins a new transaction.
   */
  async beginTransaction(): Promise<void> {
    if (this.#activeTransaction) {
      throw new Error('Transaction already in progress');
    }

    this.#activeTransaction = true;
  }

  /**
   * Commits the current transaction.
   */
  async commitTransaction(): Promise<void> {
    if (!this.#activeTransaction) {
      throw new Error('No active transaction to commit');
    }

    // Execute all commit listeners
    for (const listener of this.#transactionListeners.commit) {
      await listener();
    }

    this.#activeTransaction = false;
    this.#transactionListeners.commit = [];
    this.#transactionListeners.rollback = [];
  }

  /**
   * Rolls back the current transaction.
   */
  async rollbackTransaction(): Promise<void> {
    if (!this.#activeTransaction) {
      throw new Error('No active transaction to rollback');
    }

    // Execute all rollback listeners
    for (const listener of this.#transactionListeners.rollback) {
      await listener();
    }

    this.#activeTransaction = false;
    this.#transactionListeners.commit = [];
    this.#transactionListeners.rollback = [];
  }

  /**
   * Checks if there is an active transaction.
   */
  hasActiveTransaction(): boolean {
    return this.#activeTransaction;
  }

  /**
   * Registers a commit listener that will be called when the transaction is committed.
   * @param listener The listener function to register
   */
  onCommit(listener: () => Promise<void>): void {
    this.#transactionListeners.commit.push(listener);
  }

  /**
   * Registers a rollback listener that will be called when the transaction is rolled back.
   * @param listener The listener function to register
   */
  onRollback(listener: () => Promise<void>): void {
    this.#transactionListeners.rollback.push(listener);
  }
}
