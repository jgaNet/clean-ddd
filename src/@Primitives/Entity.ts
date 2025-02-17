/**
 * Entity is a fundamental primitive class that serves as the base for all domain entities in the application.
 *
 * This class implements the concept of Entity from Domain-Driven Design (DDD), where entities
 * are distinguished by their identity rather than their attributes.
 *
 * Key characteristics:
 * - Provides a unique identifier (_id) for each entity instance
 * - Uses private class fields (#_id) for encapsulation
 * - Implements equality comparison based on identity
 * - Follows DDD principles for entity identification
 *
 * Core features:
 * - Immutable ID: Once set, the entity's ID cannot be changed
 * - Identity comparison: equals() method for comparing entities based on their IDs
 * - Getter access: Controlled access to the entity's ID
 *
 * Usage:
 * All domain entities should extend this base class to inherit
 * standard identity management and comparison capabilities
 * (e.g., User extends Entity, Product extends Entity).
 */

export class Entity {
  readonly #_id: string;
  constructor(id: string) {
    this.#_id = id;
  }

  get _id(): string {
    return this.#_id;
  }

  equals(entity: Entity): boolean {
    return this._id === entity._id;
  }
}
