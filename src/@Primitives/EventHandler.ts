/**
 * EventHandler is a primitive abstract class that defines the base contract for all event handlers
 * in the application's event-driven architecture.
 *
 * This class works in conjunction with Event and EventBus primitives to provide
 * a type-safe and consistent way to handle events across the application.
 *
 * Key characteristics:
 * - Generic type T extends Event<unknown> ensures type safety for event handling
 * - Abstract execute method enforces consistent handler implementation
 * - Returns Promise<ResultValue> for async operation support
 * - Used by both command and domain event handlers
 *
 * Core features:
 * - Type-safe event handling: Ensures handlers only process their intended event types
 * - Async execution: All handlers operate asynchronously
 * - Result wrapping: Uses ResultValue for standardized success/failure handling
 *
 * Usage examples in the project:
 * - Command handlers (CreateUserCommandHandler)
 * - Domain event handlers (UserCreatedHandler)
 * - Integration event handlers
 * - Exception event handlers
 */

import { Event } from './Event';
import { ResultValue } from './Result';

export abstract class EventHandler<T extends Event<unknown>> {
  abstract execute(payload: T): Promise<ResultValue>;
}
