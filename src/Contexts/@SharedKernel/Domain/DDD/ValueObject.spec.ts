import { ValueObject } from './ValueObject';

class Name extends ValueObject<string> {}
class Nickname extends ValueObject<string> {}

class Money extends ValueObject<{ amount: number; currency: string }> {
  protected equalsValue(a: { amount: number; currency: string }, b: { amount: number; currency: string }): boolean {
    return a.amount === b.amount && a.currency === b.currency;
  }
}

class Unspecified extends ValueObject<{ a: number }> {}

describe('ValueObject', () => {
  it('compares primitive values by value', () => {
    expect(new Name('alice').equals(new Name('alice'))).toBe(true);
    expect(new Name('alice').equals(new Name('bob'))).toBe(false);
  });

  it('never equates two kinds that happen to hold the same value', () => {
    expect(new Name('alice').equals(new Nickname('alice'))).toBe(false);
  });

  it('compares a structured value the way its class says', () => {
    expect(new Money({ amount: 10, currency: 'EUR' }).equals(new Money({ amount: 10, currency: 'EUR' }))).toBe(true);
    expect(new Money({ amount: 10, currency: 'EUR' }).equals(new Money({ amount: 10, currency: 'USD' }))).toBe(false);
  });

  it('refuses to guess for a structured value whose class did not say', () => {
    expect(() => new Unspecified({ a: 1 }).equals(new Unspecified({ a: 1 }))).toThrow(/Unspecified.*equalsValue/);
  });
});
