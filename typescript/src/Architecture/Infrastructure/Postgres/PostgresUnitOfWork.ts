import type pg from 'pg';

import { Outbox, UnitOfWork } from '@Architecture/Application';
import { InMemoryDataSource } from '@Architecture/Infrastructure/DataSources/InMemoryDataSource';
import { PostgresDatabase } from '@Architecture/Infrastructure/Postgres/PostgresDatabase';
import { PostgresOutbox } from '@Architecture/Infrastructure/Postgres/PostgresOutbox';

/**
 * The transaction boundary over a PostgreSQL database (ADR 47): one connection borrowed from
 * the pool for the transaction, `BEGIN` to `COMMIT` or `ROLLBACK`, released after. One instance
 * per request, built by the transport; `another()` borrows another connection for a reaction's
 * own transaction (ADR 30). The outbox is this transaction's (`outbox`, ADR 24): what it appends
 * commits or rolls back with the adapters' writes, because they all write through `client`.
 *
 * `client` is the connection an adapter of this context writes through, inside
 * `withTransaction()`; asked for outside a transaction, it throws rather than borrow one of its
 * own, because an adapter writing outside the unit of work would commit on its own and leave
 * the outbox behind. A `save()` that refuses a stale version does it in one statement here
 * (`UPDATE … WHERE id = $1 AND version = $2`, zero rows: a conflict), as CONC-OPTIMISTIC asks.
 *
 * `lock(key)` is for a rule that spans several aggregates and must see them all at once — the
 * balances of a group summing to zero while twenty expenses land on two servers — and it is the
 * one place such a rule serializes its writers: an advisory lock on the transaction's own
 * connection, released at commit or rollback, never taken through the pool, where a second
 * borrower waiting on the first deadlocks the process. A rule inside one aggregate needs none:
 * its version check is enough.
 *
 * The in-memory stores of the process are snapshotted too, as the in-memory unit of work does,
 * so a context still on an in-memory store beside the database keeps the boundary it had.
 */
export class PostgresUnitOfWork implements UnitOfWork {
  #client: pg.PoolClient | null = null;
  #restore: (() => void)[] | null = null;
  readonly outbox: Outbox;

  constructor(
    private readonly database: PostgresDatabase,
    private readonly stores: Iterable<InMemoryDataSource<unknown>> = InMemoryDataSource.all,
  ) {
    this.outbox = new PostgresOutbox(database, () => this.#client);
  }

  async beginTransaction(): Promise<void> {
    if (this.#client) {
      throw new Error('Transaction already in progress');
    }
    const client = await this.database.connect();
    try {
      await client.query('BEGIN');
    } catch (error) {
      client.release();
      throw error;
    }
    this.#client = client;
    this.#restore = [...this.stores].map(store => store.snapshot());
  }

  async commitTransaction(): Promise<void> {
    const client = this.#client;
    if (!client) {
      throw new Error('No active transaction to commit');
    }
    try {
      await client.query('COMMIT');
    } finally {
      this.#end(client);
    }
  }

  async rollbackTransaction(): Promise<void> {
    const client = this.#client;
    if (!client) {
      throw new Error('No active transaction to rollback');
    }
    try {
      await client.query('ROLLBACK');
    } finally {
      this.#restore?.forEach(restore => restore());
      this.#end(client);
    }
  }

  hasActiveTransaction(): boolean {
    return this.#client !== null;
  }

  /** The same database and stores, another connection: a transaction of its own, a reaction's (ADR 30). */
  another(): UnitOfWork {
    return new PostgresUnitOfWork(this.database, this.stores);
  }

  /** The open transaction's connection, for the adapters of this context; none open is a programming error. */
  get client(): pg.PoolClient {
    if (!this.#client) {
      throw new Error(
        'No active transaction: an adapter writes through the unit of work of the context it was given, inside withTransaction()',
      );
    }
    return this.#client;
  }

  /** Serializes the writers of one key until this transaction ends (`pg_advisory_xact_lock`). */
  async lock(key: string): Promise<void> {
    await this.client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [key]);
  }

  #end(client: pg.PoolClient): void {
    client.release();
    this.#client = null;
    this.#restore = null;
  }
}
