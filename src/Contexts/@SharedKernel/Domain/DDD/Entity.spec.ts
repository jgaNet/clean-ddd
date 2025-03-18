import { Id } from '../Utils';
import { Entity } from './Entity';

describe('Entity', function () {
  it('should check if 2 entity are equals', () => {
    const entity1 = new Entity(new Id('a'));
    const entity2 = new Entity(new Id('a'));

    expect(entity1.equals(entity2)).toBeTruthy();
  });

  it('should check if 2 entity are not equals', () => {
    const entity1 = new Entity(new Id('a'));
    const entity2 = new Entity(new Id('b'));

    expect(entity1.equals(entity2)).toBeFalsy();
  });
});
