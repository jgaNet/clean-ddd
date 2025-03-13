/**
 * QueryHandler is a primitive abstract class that implements the Query part of CQRS
 * (Command Query Responsibility Segregation) pattern in the application.
 *
 * This class provides a standardized way to handle read operations, working in
 * conjunction with QueriesService to access data sources.
 *
 * Key characteristics:
 * - Generic types for type-safe query handling:
 *   T: QueriesService type
 *   P: Query payload type
 *   R: Result type extending ResultValue
 * - Separation of read operations from write operations
 * - Async execution support
 *
 * Core features:
 * - Protected queriesService for data access
 * - Abstract execute method for query implementation
 * - Type-safe result handling through ResultValue
 *
 * Usage examples:
 * ```typescript
 * // Define a query payload type
 * interface GetUserByIdQuery {
 *   id: string;
 * }
 *
 * // Define a query handler implementation
 * class GetUserByIdQueryHandler extends QueryHandler<
 *   UserQueriesService,
 *   GetUserByIdQuery,
 *   Result<UserDTO>
 * > {
 *   constructor(queriesService: UserQueriesService) {
 *     super(queriesService);
 *   }
 *
 *   async execute(query: GetUserByIdQuery): Promise<Result<UserDTO>> {
 *     try {
 *       const user = await this.queriesService.findById(query.id);
 *       if (!user) return Result.fail(new UserNotFoundError());
 *       return Result.ok(UserMapper.toDTO(user));
 *     } catch (error) {
 *       return Result.fail(error);
 *     }
 *   }
 * }
 *
 * // Usage in a controller
 * const userResult = await getUserByIdQueryHandler.execute({ id: '123' });
 * if (userResult.isSuccess()) {
 *   return userResult.data;
 * }
 * ```
 *
 * Project Examples:
 * - GetUsersQueryHandler: Retrieves user lists
 * - GetOperationsHandler: Retrieves operations data
 *
 * Related components:
 * - {@link CommandHandler} - Handles write operations in CQRS
 * - {@link QueriesService} - Provides data access methods
 * - {@link Result} - Wraps query results with success/failure information
 * - {@link Module} - Registers and resolves query handlers
 */

import { QueriesService } from '@SharedKernel/Domain/DDD';
import { DataSource } from '@SharedKernel/Domain/Services';
import { IResult, Result } from './Result';
import { ExecutionContext } from './ExecutionContext';

/**
 * Abstract QueryHandler class for handling read operations in the CQRS pattern.
 *
 * @template T The QueriesService type used for data access
 * @template P The query payload type (parameters for the query)
 * @template R The result type, which must extend IResult
 */
export abstract class QueryHandler<T extends QueriesService<DataSource<unknown>>, P, R extends IResult<unknown>> {
  /**
   * The queries service instance used to access data
   */
  protected queriesService: T;

  /**
   * Creates a new QueryHandler with the provided queries service
   *
   * @param queriesService The queries service to use for data access
   */
  constructor(queriesService: T) {
    this.queriesService = queriesService;
  }

  /**
   * Executes the query operation with the provided payload and execution context
   *
   * This is the main method that clients will call, which wraps the abstract execute method
   * with additional context-based behavior.
   *
   * @param payload Optional query parameters
   * @param context The execution context containing cross-cutting concerns
   * @returns A promise resolving to the query result
   */
  async executeWithContext(payload?: P, context?: ExecutionContext): Promise<R> {
    try {
      // Log the query execution if a logger is available
      if (context?.logger) {
        context.logger.debug(`Executing query: ${this.constructor.name}`, {
          traceId: context.traceId,
          payload,
        });
      }

      // Execute the guard
      if (context?.auth) {
        const guardResult = await this.guard(payload, context);
        if (guardResult.isFailure()) {
          throw guardResult.error;
        }
      }

      // Execute the query
      const result = await this.execute(payload, context);

      // Log the result if a logger is available
      if (context?.logger) {
        if (result.isSuccess()) {
          context.logger.debug(`Query executed successfully: ${this.constructor.name}`, {
            traceId: context.traceId,
          });
        } else {
          context.logger.warn(`Query execution failed: ${this.constructor.name}`, {
            traceId: context.traceId,
            error: (result as R).error,
          });
        }
      }

      return result;
    } catch (error) {
      // Log any unexpected errors
      if (context?.logger) {
        context.logger.error(`Unhandled error in query: ${this.constructor.name}`, error, {
          traceId: context.traceId,
          payload,
        });
      }

      throw error;
    }
  }

  /**
   * Abstract method to be implemented by concrete query handlers
   *
   * @param payload Optional query parameters
   * @param context Optional execution context
   * @returns A promise resolving to the query result
   */
  abstract execute(payload?: P, context?: ExecutionContext): Promise<R>;

  /**
   * Abstract method to be implemented by concrete query handlers
   *
   * @param auth Optional execution context
   * @returns A promise resolving to the query result
   */
  protected async guard(_?: P, __?: ExecutionContext): Promise<IResult> {
    return Result.ok();
  }
}
