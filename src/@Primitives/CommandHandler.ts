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

import { Event } from './Event';
import { EventHandler } from './EventHandler';
import { Result } from './Result';

export abstract class CommandHandler<T extends Event<unknown>> extends EventHandler<T> {
  abstract execute(payload: T): Promise<Result>;
}
