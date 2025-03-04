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
 * Usage example:
 * ```typescript
 * // 1. Define an event
 * export class UserCreatedEvent extends Event<{
 *   userId: string;
 *   email: string;
 * }> {
 *   static readonly TYPE = 'Domain.User.Created';
 *   constructor(payload: {userId: string; email: string}) {
 *     super(UserCreatedEvent.TYPE, payload);
 *   }
 * }
 * 
 * // 2. Implement an event handler
 * export class UserCreatedHandler extends EventHandler<UserCreatedEvent> {
 *   constructor(private notificationService: INotificationService) {
 *     super();
 *   }
 *
 *   async execute(event: UserCreatedEvent, eventBus: EventBus): Promise<Result<void>> {
 *     try {
 *       // Handle the event by performing some action
 *       await this.notificationService.sendWelcomeEmail({
 *         userId: event.payload.userId,
 *         email: event.payload.email
 *       });
 *       
 *       return Result.ok();
 *     } catch (error) {
 *       return Result.fail(error);
 *     }
 *   }
 * }
 * 
 * // 3. Register with module
 * const module = new ModuleBuilder('Notifications')
 *   .setDomainEvent({
 *     event: UserCreatedEvent,
 *     handlers: [new UserCreatedHandler(notificationService)]
 *   })
 *   .build();
 * ```
 * 
 * Project examples:
 * - Command handlers (CreateUserCommandHandler)
 * - Domain event handlers (UserCreatedHandler)
 * - Integration event handlers
 * - Exception event handlers
 * 
 * Related components:
 * - {@link Event} - Base class for all events
 * - {@link EventBus} - Dispatches events to registered handlers
 * - {@link Result} - Encapsulates success/failure of operations
 * - {@link Operation} - Tracks event handling state
 * - {@link CommandHandler} - Specialized event handler for commands
 */

import { Event, IResult, EventBus, IOperation } from '@Primitives';

/**
 * Abstract base class for all event handlers in the application.
 * 
 * @template T The specific Event type this handler processes
 */
export abstract class EventHandler<T extends Event<unknown>> {
  /**
   * Handles an event operation by executing the event handler logic and
   * updating the operation state.
   * 
   * This method:
   * 1. Executes the event using the abstract execute method
   * 2. Marks the operation as sent
   * 3. Returns the updated operation
   * 
   * @param operation The operation containing the event to handle
   * @returns A promise resolving to the updated operation
   */
  async handle(operation: IOperation<T>): Promise<IOperation<T>> {
    this.execute(operation.event, operation.eventBus);
    return operation.sent();
  }
  
  /**
   * Abstract method that must be implemented by concrete event handlers.
   * Contains the actual business logic for processing the event.
   * 
   * @param payload The event to execute
   * @param eventBus The event bus for publishing additional events
   * @returns A promise resolving to the result of the event execution
   */
  abstract execute(payload: T, eventBus: EventBus): Promise<IResult<unknown>>;
}
