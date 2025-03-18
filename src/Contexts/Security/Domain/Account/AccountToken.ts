import { Result, IResult, ValueObject } from '@SharedKernel/Domain';
import { IAccountToken } from './DTOs';
import { Role } from '@Contexts/@SharedKernel/Domain';

interface AccountTokenValue {
  subjectId: string;
  subjectType: Role;
  issuedAt: Date;
  expiresAt: Date;
  metadata?: Record<string, unknown>;
}

export class AccountToken extends ValueObject<AccountTokenValue> {
  private constructor(value: AccountTokenValue) {
    super(value);
  }

  static create(value: AccountTokenValue): IResult<AccountToken> {
    const { subjectId, subjectType, issuedAt, expiresAt } = value;

    if (!subjectId) {
      return Result.fail(new Error('Subject ID is required'));
    }

    if (!subjectType) {
      return Result.fail(new Error('Subject type is required'));
    }

    if (!issuedAt) {
      return Result.fail(new Error('Issue date is required'));
    }

    if (!expiresAt) {
      return Result.fail(new Error('Expiration date is required'));
    }

    if (expiresAt < issuedAt) {
      return Result.fail(new Error('Expiration date must be after issue date'));
    }

    return Result.ok(new AccountToken(value));
  }

  get subjectId(): string {
    return this.value.subjectId;
  }

  get subjectType(): Role {
    return this.value.subjectType;
  }

  get issuedAt(): Date {
    return this.value.issuedAt;
  }

  get expiresAt(): Date {
    return this.value.expiresAt;
  }

  get metadata(): Record<string, unknown> | undefined {
    return this.value.metadata ? { ...this.value.metadata } : undefined;
  }

  isExpired(now: Date = new Date()): boolean {
    return this.value.expiresAt < now;
  }

  isValid(now: Date = new Date()): boolean {
    return !this.isExpired(now);
  }

  toDTO(): IAccountToken {
    return {
      subjectId: this.value.subjectId,
      subjectType: this.value.subjectType,
      issuedAt: this.value.issuedAt,
      expiresAt: this.value.expiresAt,
      metadata: this.value.metadata,
    };
  }
}
