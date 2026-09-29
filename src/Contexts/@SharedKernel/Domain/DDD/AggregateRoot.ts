/**
 * AggregateRoot is the entry point of an aggregate: a cluster of objects that must
 * always be consistent together and that is loaded and saved as a whole.
 *
 * On top of the identity inherited from Entity, an aggregate root records the domain
 * events raised by its own behaviour. The domain decides *that* something happened;
 * the application layer decides *when* to publish it (after the aggregate is saved).
 *
 * It also carries the **version** it was loaded with, so that a repository can refuse to
 * save it over a newer one: two writers who read the same version cannot both win
 * (docs/adr/0008-optimistic-concurrency-on-the-aggregate.md). A new aggregate is version 0;
 * the repository stores version + 1 on every save. The aggregate never changes its own
 * version: it is a fact about what was read, not about what happened.
 *
 * Usage:
 * - Inside a behaviour method: `this.record(NoteArchivedEvent.set({ ... }))`
 * - Inside a command handler, once saved: `this.publishDomainEvents(note, context)`
 *
 * See Note (Contexts/Notes/Domain/Note/Note.ts) for a complete example.
 */

import { Entity } from '@SharedKernel/Domain/DDD/Entity';
import { Event } from '@SharedKernel/Domain/DDD/Event';
import { Id } from '@SharedKernel/Domain/ValueObjects';

export abstract class AggregateRoot extends Entity {
  readonly #version: number;
  #domainEvents: Event<unknown>[] = [];

  constructor(id: Id, version: number = 0) {
    super(id);
    this.#version = version;
  }

  /** The version this aggregate was loaded with (0 when it was just created). */
  get version(): number {
    return this.#version;
  }

  protected record(event: Event<unknown>): void {
    this.#domainEvents.push(event);
  }

  pullDomainEvents(): Event<unknown>[] {
    const events = this.#domainEvents;
    this.#domainEvents = [];
    return events;
  }
}
