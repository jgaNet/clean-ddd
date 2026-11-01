/**
 * The transactional outbox (ADR 24): the facts a transaction makes durable with the state they
 * describe, published after the commit by a relay. A domain event is never published from
 * memory alone: `publishDomainEvents()` appends it here at commit, inside the transaction, so a
 * rollback drops it with the writes it described, and `ExecutionContext.withTransaction()`
 * relays what is pending once the commit is through. A process that dies between the commit
 * and the relay delays the fact until the next relay — the next commit, or the application's
 * start — instead of losing it.
 *
 * The outbox is the unit of work's (`UnitOfWork.outbox`), since it lives and dies with the
 * transaction, and one per process, since a relay publishes whatever is pending, whoever
 * stored it. Delivery is therefore at least once; the bus delivers a message it already
 * delivered to a subscriber once only, by the entry's id, which travels as the message's id.
 *
 * Implementations: Infrastructure/Outbox/InMemoryOutbox.ts, an in-memory store the in-memory
 * unit of work snapshots and restores with the others.
 */

import type { Event } from '@Architecture/Domain';
import type { EventBus } from '@Architecture/Application/EventBus';
import type { ExecutionContext } from '@Architecture/Application/ExecutionContext';

/** A fact made durable and not yet published: the id the message will carry, and the event. */
export interface OutboxEntry {
  id: string;
  event: Event<unknown>;
}

export interface Outbox {
  /** Stores the events with the transaction's writes, to be rolled back with them. The entries, in order. */
  append(events: Event<unknown>[]): OutboxEntry[];
  /** What is durable and not yet published, oldest first. */
  pending(): OutboxEntry[];
  /** Acknowledges a delivery: the entry will not be published again. */
  markPublished(id: string): void;
}

/** Per outbox, the entries handed to the bus whose reactions have not all finished yet. */
const relaying = new WeakMap<Outbox, Set<string>>();

/**
 * Publishes every pending entry through the bus, with the entry's id as the message's id, and
 * marks it published once every reaction it reached has committed (the operation's
 * `delivered`), never sooner: a process that dies while a reaction runs leaves the entry pending,
 * and the next relay hands it out again, to the subscribers that had not handled it yet. An
 * entry whose reaction failed stays pending too, for the next relay; one still on its way is
 * not handed out a second time meanwhile. A publication that throws leaves the entry pending,
 * and the relay goes on with the next entry: one fact that cannot go out does not hold the
 * others. The context's relay after each commit and the bootstrap's at start are the two callers.
 * Returns the entries handed to the bus.
 */
export function relayOutbox(outbox: Outbox, eventBus: EventBus, context: ExecutionContext): OutboxEntry[] {
  let onTheirWay = relaying.get(outbox);
  if (!onTheirWay) relaying.set(outbox, (onTheirWay = new Set()));
  const handed: OutboxEntry[] = [];
  for (const entry of outbox.pending()) {
    if (onTheirWay.has(entry.id)) continue;
    try {
      const delivered = eventBus.publish(entry.event, context, entry.id)?.delivered;
      handed.push(entry);
      if (!delivered) {
        outbox.markPublished(entry.id);
        continue;
      }
      const waiting = onTheirWay;
      waiting.add(entry.id);
      void delivered
        .then(everyOne => {
          if (everyOne) outbox.markPublished(entry.id);
        })
        .finally(() => waiting.delete(entry.id));
    } catch (error) {
      context.logger?.error(`Outbox entry ${entry.id} (${entry.event.name}) stays pending`, error, {
        traceId: context.traceId,
      });
    }
  }
  return handed;
}
