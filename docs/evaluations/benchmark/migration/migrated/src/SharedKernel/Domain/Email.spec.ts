import { InvalidEmailFormat } from './Email';
import { Email } from '@SharedKernel/Domain/Email';

describe('Email', () => {
  it('accepts a well-formed address and normalises it', () => {
    const email = Email.create('  Alice@Example.com ');

    expect(email.isSuccess()).toBe(true);
    expect(email.data?.value).toBe('alice@example.com');
    expect(email.data?.username).toBe('alice');
  });

  it.each(['', 'alice', 'alice@', '@example.com', 'alice@example', 'a b@example.com'])('refuses "%s"', raw => {
    const email = Email.create(raw);

    expect(email.isFailure()).toBe(true);
    expect(email.error).toBeInstanceOf(InvalidEmailFormat);
  });

  it('compares by value', () => {
    expect(Email.create('a@b.io').data?.equals(Email.create('A@B.IO').data as Email)).toBe(true);
  });
});
