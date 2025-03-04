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

import { QueriesService } from '@Primitives/QueriesService';
import { DataSource } from '@Primitives/DataSource';
import { IResult } from './Result';

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
   * Executes the query operation with the provided payload
   * 
   * @param payload Optional query parameters
   * @returns A promise resolving to the query result
   */
  abstract execute(payload?: P): Promise<R>;
}
