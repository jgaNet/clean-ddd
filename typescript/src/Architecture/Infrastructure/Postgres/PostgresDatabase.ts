import pg from 'pg';

/**
 * A PostgreSQL server, reached through one pool for the process (ADR 47). The building blocks
 * know nothing of any table a context keeps: this is the connection, the table the outbox
 * needs, and the way to borrow a connection for a transaction (`PostgresUnitOfWork`). A
 * context's adapter writes through the unit of work's connection, so that its writes and the
 * outbox's entries commit or roll back together, which is what EVENT-AFTER-COMMIT asks.
 *
 * The URL is the one `DATABASE_URL` carries (`postgresql://user:password@host:port/database`);
 * the composition root builds one database per process and closes it when the application
 * stops. A move of the storage — from a file, from another server — is the composition root's
 * business too: done once, at start, before the server serves, in one transaction, the outbox's
 * pending entries moved with the rest, so that a fact made durable before the move is still
 * published once after it.
 */
export class PostgresDatabase {
  readonly #pool: pg.Pool;

  constructor(
    readonly url: string,
    { max = 10 }: { max?: number } = {},
  ) {
    this.#pool = new pg.Pool({ connectionString: url, max });
  }

  /** A statement outside any transaction: a read the relay makes, an acknowledgement, the schema. */
  async query<Row extends pg.QueryResultRow = pg.QueryResultRow>(text: string, values: unknown[] = []): Promise<Row[]> {
    return (await this.#pool.query<Row>(text, values)).rows;
  }

  /** A connection of the pool's, for a transaction; the borrower releases it (`PostgresUnitOfWork`). */
  connect(): Promise<pg.PoolClient> {
    return this.#pool.connect();
  }

  /**
   * The one table the building blocks own, the outbox (ADR 24): what a transaction made durable
   * to be published after it commits. `position` is the publication order; `published_at` is
   * set when every reaction the entry reached has committed, never sooner. Idempotent, so the
   * composition root calls it at every start.
   */
  async ensureSchema(): Promise<void> {
    await this.query(`
      CREATE TABLE IF NOT EXISTS outbox (
        position     BIGSERIAL PRIMARY KEY,
        id           UUID NOT NULL UNIQUE,
        name         TEXT NOT NULL,
        payload      JSONB NOT NULL,
        appended_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        published_at TIMESTAMPTZ
      )`);
  }

  /** Ends the pool; the application's `stop()` calls it. */
  async close(): Promise<void> {
    await this.#pool.end();
  }
}
