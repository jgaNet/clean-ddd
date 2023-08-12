export class UserId {
  readonly #value: string;

  constructor(id: string) {
    this.#value = id;
  }

  get value() {
    return this.#value;
  }
}
