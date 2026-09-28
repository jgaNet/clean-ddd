/**
 * QueryHandler is the base class of every read use case (the "Q" of CQRS).
 *
 * A query never changes state. It asks a queries port (T) for a read model and returns it.
 * Because it does not go through aggregates, the read side can be shaped for the screen,
 * denormalized, cached or served from a different store than the write side.
 *
 * It mirrors CommandHandler: `handle()` is what a controller calls, and does the guard, the
 * logging and the safety net once; a concrete handler only writes `execute()`. There is no
 * transaction and no operation: a query answers synchronously and is never put on the bus.
 *
 * Example: Contexts/Notes/Application/Queries/GetNote/GetNoteQueryHandler.ts
 */

import { IResult, Result } from '@SharedKernel/Domain';
import { ExecutionContext } from './ExecutionContext';

/**
 * @template T The queries port the handler reads from (e.g. INoteQueries)
 * @template P The query parameters (`void` when there are none)
 * @template R The result, an IResult of the read model
 */
export abstract class QueryHandler<T, P, R extends IResult<unknown>> {
  constructor(protected queries: T) {}

  async handle(payload: P, context: ExecutionContext): Promise<R> {
    const name = this.constructor.name;
    context.logger?.debug(`Executing ${name}`, { traceId: context.traceId, payload });

    const guardResult = await this.guard(payload, context);
    if (guardResult.isFailure()) {
      context.logger?.warn(`${name} refused: ${guardResult.error.message}`, { traceId: context.traceId });
      return guardResult as R;
    }

    const result = await this.safeExecute(payload, context);
    if (result.isFailure()) {
      context.logger?.warn(`${name} failed: ${result.error.message}`, { traceId: context.traceId });
    }
    return result;
  }

  /**
   * Authorization hook. Override it to refuse callers who may not run this query.
   * Which rows they may see is the query's own business, in `execute()`.
   */
  protected async guard(_: P, __: ExecutionContext): Promise<IResult<unknown>> {
    return Result.ok();
  }

  /** The read. Implement it in each concrete handler. */
  abstract execute(payload: P, context: ExecutionContext): Promise<R>;

  private async safeExecute(payload: P, context: ExecutionContext): Promise<R> {
    try {
      return await this.execute(payload, context);
    } catch (error) {
      context.logger?.error(`Unexpected error in ${this.constructor.name}`, error, { traceId: context.traceId });
      return Result.fail(error) as R;
    }
  }
}
