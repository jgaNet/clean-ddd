import { Id } from './Id';
import { Entity } from './Entity';

class Order extends Entity {}
class Invoice extends Entity {}

describe('Entity', () => {
  it('is the same thing as another of its kind with the same id', () => {
    expect(new Order(new Id('a')).equals(new Order(new Id('a')))).toBe(true);
  });

  it('is a different thing with a different id', () => {
    expect(new Order(new Id('a')).equals(new Order(new Id('b')))).toBe(false);
  });

  it('is never the same thing as an entity of another kind, whatever the id', () => {
    expect(new Order(new Id('a')).equals(new Invoice(new Id('a')))).toBe(false);
  });
});

describe('comparing entities', () => {
  class Note extends Entity {
    constructor(
      id: Id,
      readonly title: string,
    ) {
      super(id);
    }
    toSnapshot() {
      return { _id: this._id.value, title: this.title };
    }
  }

  it('is done with equals() — the same thing — or through the snapshot — the same state', () => {
    const one = new Note(new Id('a'), 'Groceries');
    const same = new Note(new Id('a'), 'Groceries');
    const renamed = new Note(new Id('a'), 'Errands');

    expect(one.equals(same)).toBe(true);
    expect(one.equals(renamed)).toBe(true); // the same note, whatever it now says
    expect(one.toSnapshot()).toEqual(same.toSnapshot());
    expect(one.toSnapshot()).not.toEqual(renamed.toSnapshot());
  });

  it('is never done structurally: an entity keeps its state private, so toEqual sees nothing', () => {
    // Left as a warning, not as an endorsement: this passes for any two entities of a kind,
    // which is why the two assertions above are the ones to write.
    expect(new Note(new Id('a'), 'Groceries')).toEqual(new Note(new Id('a'), 'Groceries'));
  });
});
