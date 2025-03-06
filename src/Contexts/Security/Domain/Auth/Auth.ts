import { Entity, IResult, Result } from '@Primitives';
import { v4 as uuidv4 } from 'uuid';
import { IAuth } from './DTOs';

export class Auth extends Entity {
  #subjectId: string;
  #subjectType: string;
  #credentials: {
    type: string;
    value: string;
  };
  #lastAuthenticated?: Date;
  #isActive: boolean;

  private constructor(
    id: string,
    subjectId: string,
    subjectType: string,
    credentials: { type: string; value: string },
    isActive: boolean,
    lastAuthenticated?: Date,
  ) {
    super(id);
    this.#subjectId = subjectId;
    this.#subjectType = subjectType;
    this.#credentials = credentials;
    this.#isActive = isActive;
    this.#lastAuthenticated = lastAuthenticated;
  }

  static create(params: {
    subjectId: string;
    subjectType: string;
    credentials: { type: string; value: string };
    isActive?: boolean;
  }): IResult<Auth> {
    const { subjectId, subjectType, credentials, isActive = true } = params;

    if (!subjectId) {
      return Result.fail(new Error('Subject ID is required'));
    }

    if (!subjectType) {
      return Result.fail(new Error('Subject type is required'));
    }

    if (!credentials || !credentials.type || !credentials.value) {
      return Result.fail(new Error('Valid credentials are required'));
    }

    const id = uuidv4();
    return Result.ok(new Auth(id, subjectId, subjectType, credentials, isActive));
  }

  get subjectId(): string {
    return this.#subjectId;
  }

  get subjectType(): string {
    return this.#subjectType;
  }

  get credentials(): { type: string; value: string } {
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
      return Result.fail(new Error('Authentication failed: account is inactive'));
    }

    this.#lastAuthenticated = new Date();
    return Result.ok();
  }

  activate(): Result<void> {
    if (this.#isActive) {
      return Result.fail(new Error('Account is already active'));
    }

    this.#isActive = true;
    return Result.ok();
  }

  deactivate(): Result<void> {
    if (!this.#isActive) {
      return Result.fail(new Error('Account is already inactive'));
    }

    this.#isActive = false;
    return Result.ok();
  }

  updateCredentials(credentials: { type: string; value: string }): Result<void> {
    if (!credentials || !credentials.type || !credentials.value) {
      return Result.fail(new Error('Valid credentials are required'));
    }

    this.#credentials = { ...credentials };
    return Result.ok();
  }

  toDTO(): IAuth {
    return {
      _id: this._id,
      subjectId: this.#subjectId,
      subjectType: this.#subjectType,
      credentials: { ...this.#credentials },
      lastAuthenticated: this.#lastAuthenticated,
      isActive: this.#isActive,
    };
  }
}
