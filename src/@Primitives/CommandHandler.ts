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
import { CommandEvent, IResult, IEvent, IOperation, EventBus } from '@Primitives';

export abstract class CommandHandler<T extends CommandEvent<unknown>> extends EventHandler<T> {
  async handle(operation: IOperation<T>): Promise<IOperation<T>> {
    const result = await this.execute(operation.event, operation.eventBus);

    if (result.isFailure()) {
      return operation.failed(result.error);
    }

    return operation.success(result.data);
  }
  abstract execute(event: IEvent<unknown>, eventBus: EventBus): Promise<IResult<unknown>>;
}
