import { ValueObject, Result, IResult } from '@Primitives';
import { IAuthToken } from './DTOs';

interface AuthTokenProps {
  token: string;
  subjectId: string;
  subjectType: string;
  issuedAt: Date;
  expiresAt: Date;
  metadata?: Record<string, unknown>;
}

export class AuthToken extends ValueObject<AuthTokenProps> {
  private constructor(props: AuthTokenProps) {
    super(props);
  }

  static create(props: AuthTokenProps): IResult<AuthToken> {
    const { token, subjectId, subjectType, issuedAt, expiresAt } = props;

    if (!token) {
      return Result.fail(new Error('Token is required'));
    }

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

    return Result.ok(new AuthToken(props));
  }

  get token(): string {
    return this.value.token;
  }

  get subjectId(): string {
    return this.value.subjectId;
  }

  get subjectType(): string {
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

  toDTO(): IAuthToken {
    return {
      token: this.value.token,
      subjectId: this.value.subjectId,
      subjectType: this.value.subjectType,
      issuedAt: this.value.issuedAt,
      expiresAt: this.value.expiresAt,
      metadata: this.value.metadata,
    };
  }
}
