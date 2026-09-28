/**
 * Entity: an object defined by its identity, not by its attributes.
 *
 * Two entities with the same id are the same thing even if their fields differ; two with
 * different ids are different things even if every field matches. That is what `equals()`
 * expresses. The id is immutable for the whole life of the object.
 *
 * Most of the time you will extend AggregateRoot rather than Entity directly: the root is
 * the entity through which the rest of its aggregate is reached.
 *
 * Example: Contexts/Notes/Domain/Note/Note.ts
 */

import { Id } from '../Utils';

export class Entity {
  readonly #_id: Id;
  constructor(id: Id) {
    this.#_id = id;
  }

  get _id(): Id {
    return this.#_id;
  }

  equals(entity: Entity): boolean {
    return this._id.value === entity._id.value;
  }
}
