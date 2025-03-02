/**
 * EventBus Interface
 *
 * Purpose:
 * Defines a contract for event communication infrastructure that enables
 * decoupled, event-driven interactions between different parts of the system.
 *
 * Interface Definition:
 * ```typescript
 * interface EventBus {
 *   connect(): Promise<void>;
 *   dispatch<T>(EventClass: typeof Event<T>, payload: T): ResultValue<EventId>;
 *   subscribe<T>(EventClass: typeof Event<T>, handler: EventHandler<Event<T>>): Promise<void>;
 * }
 * ```
 *
 * Implementations:
 *
 * 1. InMemoryEventBus
 *    - For local development and testing
 *    ```typescript
 *    class InMemoryEventBus implements EventBus {
 *      private handlers = new Map<string, EventHandler[]>();
 *
 *      async dispatch<T>(event: Event<T>): ResultValue<EventId> {
 *        const handlers = this.handlers.get(event.type) || [];
 *        await Promise.all(handlers.map(h => h.handle(event)));
 *        return Result.ok(event.id);
 *      }
 *    }
 *    ```
 *
 * 2. KafkaEventBus
 *    - For production distributed systems
 *    ```typescript
 *    class KafkaEventBus implements EventBus {
 *      constructor(private kafka: KafkaClient) {}
 *
 *      async dispatch<T>(event: Event<T>): ResultValue<EventId> {
 *        await this.kafka.produce({
 *          topic: event.type,
 *          message: event.serialize()
 *        });
 *        return Result.ok(event.id);
 *      }
 *    }
 *    ```
 *
 * Usage Examples:
 *
 * 1. Command Handler Publishing Events:
 *    ```typescript
 *    class CreateUserHandler {
 *      constructor(private eventBus: EventBus) {}
 *
 *      async execute(command: CreateUserCommand): Promise<Result<void>> {
 *        // Create user logic...
 *
 *        // Publish domain event
 *        const event = new UserCreatedEvent(newUser);
 *        await this.eventBus.dispatch(event);
 *
 *        return Result.ok();
 *      }
 *    }
 *    ```
 *
 * 2. Event Handler Subscription:
 *    ```typescript
 *    class UserCreatedHandler implements EventHandler<UserCreatedEvent> {
 *      async handle(event: UserCreatedEvent): Promise<void> {
 *        // Handle user created logic...
 *      }
 *    }
 *
 *    // In module setup
 *    await eventBus.subscribe(UserCreatedEvent, new UserCreatedHandler());
 *    ```
 *
 * 3. Cross-Module Communication:
 *    ```typescript
 *    // Users Module
 *    class UserVerifiedHandler {
 *      constructor(private eventBus: EventBus) {}
 *
 *      async handle(event: UserVerifiedEvent): Promise<void> {
 *        // Handle verification
 *        await this.eventBus.dispatch(new UserVerificationCompletedEvent({
 *          userId: event.payload.userId
 *        }));
 *      }
 *    }
 *
 *    // Auth Module
 *    class UserVerificationCompletedHandler {
 *      async handle(event: UserVerificationCompletedEvent): Promise<void> {
 *        // Update auth status
 *      }
 *    }
 *    ```
 *
 * Key Features:
 * 1. Type Safety: Generic types ensure correct event/handler matching
 * 2. Async Support: All operations are Promise-based
 * 3. Pluggable: Different implementations for different environments
 * 4. Reliable: Built-in error handling with Result type
 * 5. Scalable: Supports both local and distributed scenarios
 *
 * Benefits:
 * - Decoupled Communication: Publishers don't know about subscribers
 * - Flexible Architecture: Easy to add new event types and handlers
 * - Testable: Easy to mock and verify event flows
 * - Production Ready: Supports different transport mechanisms
 * - Type Safe: Compile-time checking of event handling
 */

import { Event, EventHandler, IOperation } from '@Primitives';

export interface EventBus {
  connect(): Promise<void>;
  dispatch<T>(event: Event<T>): IOperation<Event<T>>;
  subscribe<T>(event: Event<T>['name'], eventHandler: EventHandler<Event<T>>): Promise<void>;
}
