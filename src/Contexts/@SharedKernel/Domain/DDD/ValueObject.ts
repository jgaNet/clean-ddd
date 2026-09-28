/**
 * ValueObject: an object defined by its value, with no identity of its own.
 *
 * Two value objects are equal when their values are equal. They are immutable: to "change"
 * one you create another. Their job is to make an invalid value impossible to represent,
 * so validation lives in the value object instead of being sprinkled across the code.
 *
 * Examples: ValueObjects/Id.ts, ValueObjects/Email.ts, Contexts/Notes/Domain/Note/NoteTitle.ts
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
