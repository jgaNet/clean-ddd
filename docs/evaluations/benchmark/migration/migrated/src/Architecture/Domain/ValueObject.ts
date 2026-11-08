/**
 * ValueObject: an object defined by its value, with no identity of its own.
 *
 * Two value objects are equal when they are of the same kind and their values are equal.
 * They are immutable: to "change" one you create another. Their job is to make an invalid
 * value impossible to represent, so validation lives in the value object instead of being
 * sprinkled across the code.
 *
 * Equality is explicit. For a primitive value (a string, a number, a boolean) the base class
 * compares with `===`; a value object built over a structure (an object, an array) must say
 * what "equal" means by overriding `equalsValue()`, because no generic comparison gets dates,
 * key order and nested values right for every case. Forgetting to do so is a programming
 * error and throws, at the first comparison, naming the class.
 *
 * `value` is a public `readonly` field rather than a `#private` one behind a getter, for the
 * same reason as on Event: a value object *is* its value, so a test that writes
 * `expect(note.title).toEqual(NoteTitle.create('Groceries').data)` must compare it. A private
 * field is invisible to a structural comparison, and that assertion would pass whatever the
 * value said.
 *
 * Examples: ValueObjects/Id.ts, SharedKernel/Domain/Email.ts, Contexts/Notes/Domain/Note/NoteTitle.ts
 * (primitive); Contexts/Security/Domain/Account/Credentials.ts (structured).
 */

export class ValueObject<T> {
  readonly value: T;

  constructor(value: T) {
    this.value = value;
  }

  equals(other: ValueObject<T>): boolean {
    return this.constructor === other.constructor && this.equalsValue(this.value, other.value);
  }

  protected equalsValue(a: T, b: T): boolean {
    if (isPrimitive(a) && isPrimitive(b)) return a === b;
    throw new Error(
      `${this.constructor.name} holds a structured value: override equalsValue() to say when two are equal`,
    );
  }
}

const isPrimitive = (value: unknown): boolean =>
  value === null || (typeof value !== 'object' && typeof value !== 'function');
