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
