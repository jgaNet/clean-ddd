/**
 * Result is a primitive class that implements the Result pattern for handling
 * operation outcomes throughout the application. It provides a type-safe way to
 * handle both successful and failed operations.
 *
 * Key characteristics:
 * - Generic type T for type-safe success data
 * - Immutable result state
 * - Built-in error handling with Exception types
 * - Discriminated union types for type-safe checking
 *
 * Core features:
 * - Static ok(): Creates successful results with optional data
 * - Static fail(): Creates failure results with typed errors
 * - Type guards: isSuccess() and isFailure() for safe type checking
 * - Exception wrapping: Handles various error types consistently
 *
 * Usage in the project:
 * - Used by CommandHandlers for operation results
 * - Used by QueryHandlers for data retrieval
 * - Used in domain operations (User.create())
 * - Supports both sync and async operations
 *
 * Types:
 * - ResultSuccess<T>: Represents successful operations with data
 * - ResultError: Represents failed operations with exceptions
 * - ResultValue<T>: Union type for all possible results
 */

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
