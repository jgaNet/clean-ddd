/**
 * Entity: an object defined by its identity, not by its attributes.
 *
 * Two entities of the same kind with the same id are the same thing even if their fields
 * differ; two with different ids are different things even if every field matches. That is
 * what `equals()` expresses. The kind matters: an Account and a Note that happened to share
 * an id would not be the same thing. The id is immutable for the whole life of the object.
 *
 * Most of the time you will extend AggregateRoot rather than Entity directly: the root is
 * the entity through which the rest of its aggregate is reached.
 *
 * Its state stays in `#private` fields, and that is the encapsulation the whole design rests
 * on — so, unlike a value object, an entity cannot be compared structurally: `expect(a).toEqual(b)`
 * on two entities compares nothing and passes for any two. Compare them with `equals()` (are
 * they the same thing?) or through `toSnapshot()` (do they hold the same state?). Entity.spec.ts
 * shows both.
 *
 * Example: Contexts/Notes/Domain/Note/Note.ts
 */

import { Id } from './Id';

export class Entity {
  readonly #_id: Id;
  constructor(id: Id) {
    this.#_id = id;
  }

  get _id(): Id {
    return this.#_id;
  }

  equals(entity: Entity): boolean {
    return this.constructor === entity.constructor && this._id.equals(entity._id);
  }
}
