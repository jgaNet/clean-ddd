import type pg from 'pg';
import { v4 as uuidv4 } from 'uuid';

import { Event } from '@Architecture/Domain';
import { Outbox, OutboxEntry } from '@Architecture/Application';
import { PostgresDatabase } from '@Architecture/Infrastructure/Postgres/PostgresDatabase';

/**
 * The outbox over the `outbox` table (ADR 24, ADR 47). `append()` writes with the connection of
 * the transaction that is making the state durable, and with no other: an entry appended by a
 * transaction that rolls back is gone with the transaction's writes, which is the whole point.
 * `pending()` and `markPublished()` go through the pool, since the relay runs after the commit,
 * outside any transaction, and acknowledges an entry once its reactions have committed.
 *
 * What comes back from the table is an `Event` with the name and the payload the row kept, not
 * the class that was appended: the bus routes on the name, and a handler reads the payload, so
 * a fact relayed after a restart reaches the same subscribers. The payload is JSON: a `Date` a
 * domain event carried inside its context is read back as its ISO string by a reaction that runs
 * after a restart, which is why an integration event's payload carries ISO strings by contract.
 */
export class PostgresOutbox implements Outbox {
  constructor(
    private readonly database: PostgresDatabase,
    /** The connection of the unit of work's open transaction, or null outside one. */
    private readonly transaction: () => pg.PoolClient | null = () => null,
  ) {}

  async append(events: Event<unknown>[]): Promise<OutboxEntry[]> {
    const client = this.transaction();
    if (!client) {
      throw new Error(
        'The outbox is written inside the transaction that makes the state durable (ADR 24): append() needs the unit of work to have an open transaction',
      );
    }
    const entries = events.map(event => ({ id: uuidv4(), event }));
    for (const entry of entries) {
      await client.query('INSERT INTO outbox (id, name, payload) VALUES ($1, $2, $3)', [
        entry.id,
        entry.event.name,
        JSON.stringify(entry.event.payload),
      ]);
    }
    return entries;
  }

  async pending(): Promise<OutboxEntry[]> {
    const rows = await this.database.query<{ id: string; name: string; payload: unknown }>(
      'SELECT id, name, payload FROM outbox WHERE published_at IS NULL ORDER BY position',
    );
    return rows.map(row => ({ id: row.id, event: new Event({ name: row.name, payload: row.payload }) }));
  }

  async markPublished(id: string): Promise<void> {
    await this.database.query('UPDATE outbox SET published_at = now() WHERE id = $1 AND published_at IS NULL', [id]);
  }
}
