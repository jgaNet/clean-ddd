import { Email } from '@Contexts/@SharedKernel/Domain/Utils/Email';
import { Result, IResult } from '@SharedKernel/Domain/Application';
import { Entity } from '@SharedKernel/Domain/DDD';
import { v4 as uuidv4 } from 'uuid';
import { Role, Id } from '@Contexts/@SharedKernel/Domain';
import { InvalidAccountException } from './AccountExceptions';
import { InvalidCredentialsException } from '../Auth/Exceptions/InvalidCredentialsException';
import { InactiveAccountException } from '../Auth/Exceptions/InactiveAccountException';

export class Account extends Entity {
  #subjectId: Email;
  #subjectType: Role;
  #credentials: {
    type: string;
    value: string;
    metadata?: Record<string, unknown>;
  };
  #lastAuthenticated?: Date;
  #isActive: boolean;

  private constructor(
    id: Id,
    subjectId: string,
    subjectType: Role,
    credentials: { type: string; value: string; metadata?: Record<string, unknown> },
    isActive: boolean,
    lastAuthenticated?: Date,
  ) {
    super(id);
    this.#subjectId = new Email(subjectId);
    this.#subjectType = subjectType;
    this.#credentials = credentials;
    this.#isActive = isActive;
    this.#lastAuthenticated = lastAuthenticated;
  }

  static create(params: {
    subjectId: string;
    subjectType: Role;
    credentials: { type: string; value: string; metadata?: Record<string, unknown> };
    isActive?: boolean;
  }): IResult<Account> {
    const { subjectId, subjectType, credentials, isActive = true } = params;

    if (!subjectId) {
      return Result.fail(new InvalidAccountException('Subject ID is required'));
    }

    if (!subjectType) {
      return Result.fail(new InvalidAccountException('Subject type is required'));
    }

    if (!credentials || !credentials.type || !credentials.value) {
      return Result.fail(new InvalidCredentialsException('Valid credentials are required'));
    }

    const id = uuidv4();

    try {
      return Result.ok(new Account(new Id(id), subjectId, subjectType, credentials, isActive));
    } catch (error) {
      return Result.fail(error);
    }
  }

  get subjectId(): string {
    return this.#subjectId.value;
  }

  get subjectType(): Role {
    return this.#subjectType;
  }

  get credentials(): { type: string; value: string; metadata?: Record<string, unknown> } {
    return { ...this.#credentials };
  }

  get lastAuthenticated(): Date | undefined {
    return this.#lastAuthenticated;
  }

  get isActive(): boolean {
    return this.#isActive;
  }

  authenticate(): Result<void> {
    if (!this.#isActive) {
      return Result.fail(new InactiveAccountException('Authentication failed: account is inactive'));
    }

    this.#lastAuthenticated = new Date();
    return Result.ok();
  }

  activate(): Result<void> {
    if (this.#isActive) {
      return Result.fail(new InvalidAccountException('Account is already active'));
    }

    this.#isActive = true;
    return Result.ok();
  }

  deactivate(): Result<void> {
    if (!this.#isActive) {
      return Result.fail(new InactiveAccountException('Account is already inactive'));
    }

    this.#isActive = false;
    return Result.ok();
  }

  updateCredentials(credentials: { type: string; value: string; metadata?: Record<string, unknown> }): IResult<void> {
    if (!credentials || !credentials.type || !credentials.value) {
      return Result.fail(new InvalidCredentialsException('Valid credentials are required'));
    }

    this.#credentials = { ...credentials };
    return Result.ok();
  }
}
