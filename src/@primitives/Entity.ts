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
