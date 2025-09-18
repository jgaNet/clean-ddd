import { ValueObject } from './ValueObject';

describe('ValueObject', function () {
  it('should check if 2 value objects are equals', () => {
    const valueObject1 = new ValueObject('a');
    const valueObject2 = new ValueObject('a');

    expect(valueObject1.equals(valueObject2)).toBeTruthy();
  });

  it('should check if 2 value objects are equals deeply', () => {
    const valueObject1 = new ValueObject({ a: 1, b: { c: 2 } });
    const valueObject2 = new ValueObject({ a: 1, b: { c: 2 } });

    expect(valueObject1.equals(valueObject2)).toBeTruthy();
  });

  it('should check if 2 value objects are not equals', () => {
    const valueObject1 = new ValueObject({});
    const valueObject2 = new ValueObject({ test: 'test' });

    expect(valueObject1.equals(valueObject2)).toBeFalsy();
  });

  it('should check if 2 value objects are not equals deeply', () => {
    const valueObject1 = new ValueObject({ a: 1, b: { c: 2 } });
    const valueObject2 = new ValueObject({ a: 1, b: { c: 3 } });

    expect(valueObject1.equals(valueObject2)).toBeFalsy();
  });
});
