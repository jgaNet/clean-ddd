import { Exception, UnknownException } from './Exception';

export default class Result<T = unknown> {
  constructor(
    public readonly success: boolean,
    public readonly data?: T,
    public readonly error?: Exception | undefined,
  ) {}

  static ok<T>(data?: T): Result<T> {
    return new Result<T>(true, data);
  }

  static fail<E>(error: E): Result {
    if (error instanceof Exception) {
      return new Result(false, undefined, error);
    }

    if (error instanceof Error) {
      return new Result(false, undefined, new UnknownException(error.message, error.stack));
    }

    return new Result(false, undefined, new UnknownException(JSON.stringify(error)));
  }
}
