/**
 * ValueObject is a primitive class that implements the Value Object pattern from
 * Domain-Driven Design (DDD). It represents objects that are distinguished by their
 * compositional values rather than a unique identity.
 *
 * Key characteristics:
 * - Immutable: Values cannot be changed after creation
 * - Equality by value: Two value objects are equal if their values are equal
 * - Generic type T for type-safe value handling
 * - Encapsulated value using private field (#value)
 *
 * Core features:
 * - Type-safe value storage and retrieval
 * - Deep equality comparison through JSON stringification
 * - Read-only access to internal value
 *
 * Usage examples in the project:
 * - UserEmail: Encapsulates email validation and formatting
 * - UserProfile: Represents user profile attributes
 * - Used for domain model attributes that need value semantics
 * - Supports domain invariants and validation
 */

export class ValueObject<T> {
  readonly #value: T;
  constructor(value: T) {
    this.#value = value;
  }

  get value() {
    return this.#value;
  }

  equals(other: ValueObject<T>): boolean {
    return JSON.stringify(this.#value) === JSON.stringify(other.value);
  }
}
