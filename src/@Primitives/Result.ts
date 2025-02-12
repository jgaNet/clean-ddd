import { Exception, UnknownException } from './Exception';

export class Result<T = undefined> {
  constructor(public readonly success: boolean, public readonly data?: T, public readonly error?: Exception) {}

  static ok<T>(data?: T): ResultSuccess<T> {
    return new ResultSuccess<T>(true, data);
  }

  static fail(error: ResultError | Exception | Error | unknown): ResultError {
    if (error instanceof ResultError) {
      return error;
    }

    if (error instanceof Exception) {
      return new ResultError(error);
    }

    if (error instanceof Error) {
      return new ResultError(new UnknownException(error.message, error.stack));
    }

    return new ResultError(new UnknownException(JSON.stringify(error)));
  }

  isSuccess(): this is ResultSuccess<T> {
    return this.success;
  }

  isFailure(): this is ResultError {
    return !this.success;
  }
}

class ResultError extends Result<undefined> {
  constructor(error: Exception) {
    super(false, undefined, error);
  }
}

class ResultSuccess<T> extends Result<T> {
  success = true;
  declare data: T;
}

export type ResultValue<T = undefined> = ResultSuccess<T> | ResultError;
