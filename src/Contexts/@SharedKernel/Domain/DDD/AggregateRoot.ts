/**
 * AggregateRoot is the entry point of an aggregate: a cluster of objects that must
 * always be consistent together and that is loaded and saved as a whole.
 *
 * On top of the identity inherited from Entity, an aggregate root records the domain
 * events raised by its own behaviour. The domain decides *that* something happened;
 * the application layer decides *when* to publish it (after the aggregate is saved).
 *
 * Usage:
 * - Inside a behaviour method: `this.record(NoteArchivedEvent.set({ ... }))`
 * - Inside a command handler, once saved: `this.publishDomainEvents(note, context)`
 *
 * See Note (Contexts/Notes/Domain/Note/Note.ts) for a complete example.
 */

import { Entity } from '@SharedKernel/Domain/DDD/Entity';
import { Event } from '@SharedKernel/Domain/DDD/Event';

export abstract class AggregateRoot extends Entity {
  #domainEvents: Event<unknown>[] = [];

  protected record(event: Event<unknown>): void {
    this.#domainEvents.push(event);
  }

  pullDomainEvents(): Event<unknown>[] {
    const events = this.#domainEvents;
    this.#domainEvents = [];
    return events;
  }
}
