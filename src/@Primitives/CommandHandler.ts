/**
 * CommandHandler is a core primitive that represents the application's command handling infrastructure.
 *
 * This abstract class serves as a base for all command handlers in the application, following
 * the Command Pattern and CQRS (Command Query Responsibility Segregation) principles.
 *
 * Key characteristics:
 * - Extends EventHandler to handle command events
 * - Generic type T extends Event<unknown> to ensure type safety for command payloads
 * - Requires implementation of an execute method that processes the command and returns a Result
 * - Follows the Single Responsibility Principle by handling one specific command type
 *
 * Usage:
 * Concrete command handlers should extend this class and implement the execute method
 * to handle specific domain commands (e.g., CreateUserCommandHandler).
 */

import { EventHandler } from './EventHandler';
import { CommandEvent, ResultValue, Event } from '@Primitives';
import { Operation } from '@Shared/Domain/Operation/Operation';

export abstract class CommandHandler<T extends CommandEvent<unknown>> extends EventHandler<T> {
  async handle(operation: Operation<T>): Promise<Operation<T>> {
    const result = await this.execute(operation.event);

    if (result.isFailure()) {
      return operation.failed(result.error);
    }

    return operation.success(result.data);
  }
  abstract execute(event: Event<unknown>): Promise<ResultValue<unknown>>;
}
