/**
 * QueryHandler is the base class of every read use case (the "Q" of CQRS).
 *
 * A query never changes state. It asks a queries port (T) for a read model and returns it.
 * Because it does not go through aggregates, the read side can be shaped for the screen,
 * denormalized, cached or served from a different store than the write side.
 *
 * Like CommandHandler, the base class takes care of the guard (authorization) and logging,
 * so a concrete handler only writes `execute()`.
 *
 * Example: Contexts/Notes/Application/Queries/GetMyNotes/GetMyNotesQueryHandler.ts
 */

import { IResult, Result } from '@SharedKernel/Domain';
import { ExecutionContext } from './ExecutionContext';

/**
 * Abstract QueryHandler class for handling read operations in the CQRS pattern.
 *
 * @template T The QueriesService type used for data access
 * @template P The query payload type (parameters for the query)
 * @template R The result type, which must extend IResult
 */
export abstract class QueryHandler<T, P, R extends IResult<unknown>> {
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

      // A refused query is a normal outcome, reported like any other failure (not thrown).
      if (context?.auth) {
        const guardResult = await this.guard(payload, context);
        if (guardResult.isFailure()) {
          context.logger?.warn(`Query refused: ${this.constructor.name}`, {
            traceId: context.traceId,
            error: guardResult.error,
          });
          return guardResult as R;
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
  protected async guard(_?: P, __?: ExecutionContext): Promise<IResult<unknown>> {
    return Result.ok();
  }
}
