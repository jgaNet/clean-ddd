import { Password } from './Password';
import { PasswordTooShortException } from './AccountExceptions';

describe('Password', () => {
  it('accepts a password of at least the minimum length, as typed', () => {
    const password = Password.create(' correct horse ');

    expect(password.isSuccess()).toBe(true);
    expect(password.data?.value).toBe(' correct horse ');
  });

  it('accepts a password of exactly the minimum length', () => {
    const password = Password.create('x'.repeat(Password.MIN_LENGTH));

    expect(password.isSuccess()).toBe(true);
  });

  it('refuses a password shorter than the minimum', () => {
    const password = Password.create('x'.repeat(Password.MIN_LENGTH - 1));

    expect(password.isFailure()).toBe(true);
    expect(password.error).toBeInstanceOf(PasswordTooShortException);
  });

  it('compares by value, not by reference', () => {
    const a = Password.create('same-secret');
    const b = Password.create('same-secret');

    expect(a.data?.equals(b.data as Password)).toBe(true);
  });
});
