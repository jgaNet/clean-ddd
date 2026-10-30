/**
 * EventHandler: reacts to an event. It is the base of every listener in the application
 * layer, and the parent of CommandHandler.
 *
 * A domain event handler stays inside its context and typically logs, updates a read model
 * or publishes an integration event for other contexts:
 * Contexts/Notes/Application/Events/NoteSharedHandler.ts
 *
 * An integration event handler lives in the receiving context and translates the foreign
 * event into a local command or service call:
 * Contexts/Notifications/Application/Events/NoteSharedIntegrationEventHandler.ts
 *
 * A reaction is awaited and its outcome recorded on the operation (SENT, or ERROR with the
 * failure), so a listener that fails is visible in the trace (see Tracker) instead of
 * vanishing as an unhandled rejection. It cannot undo the fact it reacted to: the event was
 * published after the commit (ADR 3), and a failed reaction is the listener's problem to
 * retry or report, never the publisher's.
 *
 * A reaction runs in a transaction of its own (ADR 30), opened here, in a context of its own
 * (`context.forReaction()`): what it saves, and the facts it records or publishes, commit
 * together or not at all, and go out through the outbox after the commit, like a command's.
 * So `execute()` saves, calls `publishDomainEvents()` for an aggregate it changed and
 * `publishIntegrationEvent()` for a fact it tells other contexts, and returns a failed Result
 * to undo all of it. It is not made idempotent by hand: all or nothing, one id per fact, and
 * the bus's inbox hand a fact to a reaction once.
 */

import { Event, IResult } from '@Architecture/Domain';
import { ExecutionContext } from '@Architecture/Application/ExecutionContext';
import { IOperation } from '@Architecture/Application/Operation';

export abstract class EventHandler<T extends Event<unknown>> {
  async handle(operation: IOperation<T>): Promise<IOperation<T>> {
    const { event } = operation;
    const context = operation.context.forReaction();
    try {
      const result = await context.withTransaction(() => this.execute(event, context));
      if (result.isFailure()) {
        context.logger?.warn(`${this.constructor.name} failed on ${event.name}: ${result.error.message}`, {
          traceId: context.traceId,
        });
        return operation.failed(result.error);
      }
      return operation.sent();
    } catch (error) {
      context.logger?.error(`Unexpected error in ${this.constructor.name} on ${event.name}`, error, {
        traceId: context.traceId,
      });
      return operation.failed(error);
    }
  }

  /** The reaction. Implement it in each concrete handler. */
  abstract execute(event: T, context: ExecutionContext): Promise<IResult<unknown>>;
}
