import { v4 as uuidv4 } from 'uuid';

import { Event } from '@Architecture/Domain';
import { Outbox, OutboxEntry } from '@Architecture/Application';
import { InMemoryDataSource } from '@Architecture/Infrastructure/DataSources/InMemoryDataSource';

/**
 * The outbox over an in-memory store (ADR 24). It is an InMemoryDataSource like any other, so
 * the in-memory unit of work snapshots it when a transaction begins and puts it back on a
 * rollback: an entry appended by a transaction that fails is gone with the transaction's other
 * writes, which is the whole point of writing the facts where the state is. Insertion order is
 * publication order; a published entry is dropped rather than flagged, since nothing here reads
 * history. One per process, shared by every request's unit of work (see the bootstrap).
 */
export class InMemoryOutbox implements Outbox {
  /** The process's outbox, for a unit of work built without one: specs, and the bootstrap's default. */
  static readonly shared = new InMemoryOutbox();

  readonly store = new InMemoryDataSource<OutboxEntry>();

  append(events: Event<unknown>[]): OutboxEntry[] {
    return events.map(event => {
      const entry = { id: uuidv4(), event };
      this.store.collection.set(entry.id, entry);
      return entry;
    });
  }

  pending(): OutboxEntry[] {
    return [...this.store.collection.values()];
  }

  markPublished(id: string): void {
    this.store.collection.delete(id);
  }
}
