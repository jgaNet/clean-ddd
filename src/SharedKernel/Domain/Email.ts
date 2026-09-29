import { ValueObject } from '@Architecture/Domain/ValueObject';
import { IResult, Result } from '@Architecture/Domain/Result';
import { Exception } from '@Architecture/Domain/Exception';

/**
 * Email is a value object: once you hold one you know it is well-formed. Like every value
 * object in this project it is built through `create()`, which returns a Result instead of
 * throwing, so an invalid input is an ordinary failure the caller handles.
 */
export class Email extends ValueObject<string> {
  static readonly MAX_LENGTH = 254;
  static readonly FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  private constructor(email: string) {
    super(email);
  }

  static create(raw: string): IResult<Email> {
    const email = raw.trim().toLowerCase();

    if (email.length > Email.MAX_LENGTH || !Email.FORMAT.test(email)) {
      return Result.fail(new InvalidEmailFormat({ email: raw }));
    }

    return Result.ok(new Email(email));
  }

  get username(): string {
    return this.value.slice(0, this.value.indexOf('@'));
  }
}

export class InvalidEmailFormat extends Exception {
  constructor({ service, email }: { service?: string; email: string }) {
    super({
      service: service || 'unknown',
      type: 'InvalidEmailFormat',
      message: 'Invalid email format',
      context: { email },
    });
  }
}
