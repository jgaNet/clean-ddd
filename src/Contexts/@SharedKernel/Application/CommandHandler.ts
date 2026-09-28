/**
 * CommandHandler is the base class of every use case that changes state (the "C" of CQRS).
 *
 * A concrete handler only writes `execute()`: load an aggregate, call a behaviour on it,
 * save it, publish its events. Everything else that every command needs is done once, here:
 *
 * 1. `guard()`  - authorization: may this caller run this command at all?
 * 2. logging    - what ran, and whether it failed
 * 3. transaction - `execute()` runs inside the context's unit of work when there is one
 * 4. safety net - an unexpected throw becomes a failed Result instead of a crash
 *
 * The handler is subscribed to its command on the event bus by the Module, so `handle()`
 * receives an Operation (the command plus its execution context) and marks it done.
 *
 * Example: Contexts/Notes/Application/Commands/EditNote/EditNoteCommandHandler.ts
 *
 * Related components:
 * - {@link CommandEvent} - the command itself, a named payload
 * - {@link ExecutionContext} - who is calling, with which logger, bus and unit of work
 * - {@link AggregateRoot} - records the domain events that `publishDomainEvents` sends
 * - {@link Module} - registers and resolves command handlers
 */

import { EventHandler } from './EventHandler';
import { CommandEvent, IResult, Result, AggregateRoot } from '@SharedKernel/Domain';
import { ExecutionContext } from '@SharedKernel/Application/ExecutionContext';
import { IOperation } from '@SharedKernel/Application/Operation';
import { publishDomainEvents } from '@SharedKernel/Application/DomainEvents';

export abstract class CommandHandler<T extends CommandEvent<unknown>> extends EventHandler<T> {
  async handle(operation: IOperation<T>): Promise<IOperation<T>> {
    const { event, context } = operation;

    const guardResult = await this.guard(event, context);
    if (guardResult.isFailure()) {
      context.logger?.warn(`${event.name} refused: ${guardResult.error.message}`, { traceId: context.traceId });
      return operation.failed(guardResult.error);
    }

    context.logger?.info(`Executing ${event.name}`, { traceId: context.traceId, payload: event.payload });

    const result = await context.withTransaction(() => this.safeExecute(event, context));

    if (result.isFailure()) {
      context.logger?.warn(`${event.name} failed: ${result.error.message}`, { traceId: context.traceId });
      return operation.failed(result.error);
    }

    return operation.success(result.data);
  }

  /**
   * Authorization hook. Override it to refuse callers who may not run this command.
   * Business rules about *what* they may do to *which* object belong in the aggregate.
   */
  protected async guard(_: T, __: ExecutionContext): Promise<IResult<unknown>> {
    return Result.ok();
  }

  /** The use case. Implement it in each concrete handler. */
  abstract execute(event: T, context: ExecutionContext): Promise<IResult<unknown>>;

  /**
   * Sends every domain event the aggregate recorded during `execute()`.
   * The events are taken from the aggregate now but published only once the surrounding
   * transaction is committed, so listeners never see facts that end up rolled back.
   */
  protected publishDomainEvents(aggregate: AggregateRoot, context: ExecutionContext): void {
    publishDomainEvents(aggregate, context);
  }

  private async safeExecute(event: T, context: ExecutionContext): Promise<IResult<unknown>> {
    try {
      return await this.execute(event, context);
    } catch (error) {
      context.logger?.error(`Unexpected error in ${event.name}`, error, { traceId: context.traceId });
      return Result.fail(error);
    }
  }
}
