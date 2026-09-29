import { Exception } from './Exception';
import { UnknownException } from './CommonExceptions';

/**
 * Result is how an operation says whether it worked. An expected failure (a refused
 * command, an invalid value) is a value the caller must look at, not an exception it may
 * forget to catch. See docs/adr/0001-result-instead-of-exceptions.md.
 *
 * Write `IResult<T>` in signatures and build one with `Result.ok(data)` / `Result.fail(error)`:
 *
 *   static create(props): IResult<Note> {
 *     const title = NoteTitle.create(props.title);
 *     if (title.isFailure()) return title;          // a failure is returned as is, whatever T
 *     return Result.ok(new Note(...));
 *   }
 *
 * `isSuccess()` / `isFailure()` narrow the type: after `if (r.isFailure()) return r;` the
 * compiler knows `r.data` is a T.
 */
export class Result<T = undefined> {
  constructor(
    public readonly data?: T,
    public readonly error?: Exception,
  ) {}

  static ok<T>(data?: T): ResultSuccess<T> {
    return new ResultSuccess<T>(data);
  }

  /** Accepts an Exception, an Error or anything thrown; everything ends up as an Exception. */
  static fail(error: ResultError | Exception | Error | unknown): ResultError {
    if (error instanceof ResultError) {
      return error;
    }

    if (Exception.isException(error)) {
      return new ResultError(error);
    }

    if (error instanceof Error) {
      return new ResultError(new UnknownException(error.message, error.stack));
    }

    return new ResultError(new UnknownException(JSON.stringify(error)));
  }

  isSuccess(): this is ResultSuccess<T> {
    return this instanceof ResultSuccess || this.data !== undefined;
  }

  isFailure(): this is ResultError {
    return this instanceof ResultError || this.error !== undefined;
  }
}

export class ResultError extends Result<undefined> {
  declare error: Exception;

  constructor(error: Exception) {
    super(undefined, error);
  }
}

export class ResultSuccess<T> extends Result<T> {
  declare data: T;
}

export type IResult<T = undefined> = ResultSuccess<T> | ResultError;
