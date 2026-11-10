/**
 * CommandHandler is the base class of every use case that changes state (the "C" of CQRS).
 *
 * A concrete handler only writes `execute()`: load an aggregate, call a behaviour on it,
 * save it, publish its events. Everything else that every command needs is done once, here:
 *
 * 0. `anyoneMayAsk()` - who reaches it: a signed-in caller by default, asked by the transport
 *                 before it publishes (API-CALLER-AT-TRANSPORT)
 * 1. `guard()`  - authorization: may this caller run this command at all?
 * 2. logging    - what ran, and whether it failed
 * 3. transaction - `execute()` runs inside the context's unit of work when there is one
 * 4. safety net - an unexpected throw becomes a failed Result instead of a crash
 * 5. retry      - a concurrency conflict is re-read and re-decided in a new transaction, up to
 *                 CONFLICT_ATTEMPTS times; the last conflict is the refusal (ADR 25)
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
import { CommandEvent, ConcurrencyConflictException, IResult, Result, AggregateRoot } from '@Architecture/Domain';
import { ExecutionContext } from '@Architecture/Application/ExecutionContext';
import { IOperation } from '@Architecture/Application/Operation';
import { publishDomainEvents } from '@Architecture/Application/DomainEvents';

export abstract class CommandHandler<T extends CommandEvent<unknown>> extends EventHandler<T> {
  /** How many times `execute()` runs on a concurrency conflict before the conflict is the answer. */
  static readonly CONFLICT_ATTEMPTS = 3;

  async handle(operation: IOperation<T>): Promise<IOperation<T>> {
    const { event, context } = operation;

    const guardResult = await this.guard(event, context);
    if (guardResult.isFailure()) {
      context.logger?.warn(`${event.name} refused: ${guardResult.error.message}`, { traceId: context.traceId });
      return operation.failed(guardResult.error);
    }

    context.logger?.info(`Executing ${event.name}`, { traceId: context.traceId });

    const result = await this.executeUntilUncontended(event, context);

    if (result.isFailure()) {
      context.logger?.warn(`${event.name} failed: ${result.error.message}`, { traceId: context.traceId });
      return operation.failed(result.error);
    }

    return operation.success(result.data);
  }

  /**
   * Who reaches this command (API-CALLER-AT-TRANSPORT, ADR 39): a signed-in caller, unless this
   * says anyone may ask for it. Override it, once, for a command anyone may ask for — signing up,
   * a link that carries its own proof, a provider's webhook. The transport's `acceptCommand()`
   * asks it before it publishes, and refuses a caller who is not signed in with 401 otherwise.
   * It says who reaches the command, not what the caller may do: that stays `guard()`'s,
   * `execute()`'s and the aggregate's.
   */
  anyoneMayAsk(_command: T): boolean {
    return false;
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
  protected async publishDomainEvents(aggregate: AggregateRoot, context: ExecutionContext): Promise<void> {
    await publishDomainEvents(aggregate, context);
  }

  /**
   * The use case in its transaction; again, from a fresh read, when the first run lost a race
   * (ADR 25). `execute()` loads the aggregate, so the second run re-decides the rule on what the
   * other writer left; nothing is re-applied blindly. A failed attempt rolled back and dropped
   * its events, like any failed Result.
   */
  private async executeUntilUncontended(event: T, context: ExecutionContext): Promise<IResult<unknown>> {
    const attempts = (this.constructor as typeof CommandHandler).CONFLICT_ATTEMPTS;
    for (let attempt = 1; ; attempt++) {
      const result = await context.withTransaction(() => this.safeExecute(event, context));
      const conflict = result.isFailure() && result.error instanceof ConcurrencyConflictException;
      if (!conflict || attempt >= attempts) return result;
      context.logger?.info(`${event.name} lost a race (attempt ${attempt} of ${attempts}); reading again`, {
        traceId: context.traceId,
      });
    }
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
