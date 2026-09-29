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
