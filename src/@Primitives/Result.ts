/**
 * Result Pattern Implementation
 *
 * Purpose:
 * The Result class provides a standardized way to handle operation outcomes,
 * replacing traditional try/catch and error throwing with explicit result objects.
 *
 * Structure:
 * - Result<T>: Base class that can hold either success data or an error
 * - ResultSuccess<T>: Represents successful operations with data of type T
 * - ResultError: Represents failed operations with structured error information
 *
 * Key Methods:
 * 1. Creating Results:
 *    - Result.ok(data): Creates successful result
 *    - Result.fail(error): Creates failure result
 *
 * 2. Type Checking:
 *    - isSuccess(): Confirms if operation succeeded
 *    - isFailure(): Confirms if operation failed
 *
 * Example Usage:
 *
 * 1. Domain Entity Creation:
 *    ```typescript
 *    class User {
 *      static create(email: string): Result<User> {
 *        if (!isValidEmail(email)) {
 *          return Result.fail(new InvalidEmailError(email));
 *        }
 *        return Result.ok(new User(email));
 *      }
 *    }
 *    ```
 *
 * 2. Command Handler:
 *    ```typescript
 *    class CreateUserHandler {
 *      async execute(command: CreateUserCommand): Promise<Result<void>> {
 *        const userResult = User.create(command.email);
 *
 *        if (userResult.isFailure()) {
 *          return Result.fail(userResult.error);
 *        }
 *
 *        await this.repository.save(userResult.data);
 *        return Result.ok();
 *      }
 *    }
 *    ```
 *
 * 3. Controller Usage:
 *    ```typescript
 *    async createUser(req: Request, res: Response) {
 *      const result = await createUserHandler.execute(req.body);
 *
 *      if (result.isSuccess()) {
 *        return res.status(201).json(result.data);
 *      }
 *
 *      return res.status(400).json({ error: result.error.message });
 *    }
 *    ```
 *
 * Benefits:
 * 1. Type Safety: TypeScript knows exactly what data is available
 * 2. Explicit Error Handling: No unexpected exceptions
 * 3. Consistent Pattern: Standard way to handle all operations
 * 4. Self-Documenting: Clear success/failure paths
 * 5. Chainable: Results can be easily composed and transformed
 */

import { Exception, UnknownException } from './Exception';

export class Result<T = undefined> {
  constructor(public readonly data?: T, public readonly error?: Exception) {}

  static ok<T>(data?: T): ResultSuccess<T> {
    return new ResultSuccess<T>(data);
  }

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
    return this.data !== undefined;
  }

  isFailure(): this is ResultError {
    return this.error !== undefined;
  }
}

export class ResultError extends Result<undefined> {
  constructor(error: Exception) {
    super(undefined, error);
  }
}

export class ResultSuccess<T> extends Result<T> {
  declare data: T;
}

export type IResult<T = undefined> = ResultSuccess<T> | ResultError;
