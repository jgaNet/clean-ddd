/**
 * Event Type System
 *
 * Purpose:
 * Defines a comprehensive type hierarchy for all events in the system,
 * enabling type-safe event-driven architecture across different layers.
 *
 * Event Types:
 *
 * 1. CommandEvent<PayloadDTO>
 *    - Purpose: Represents requests to change system state
 *    - Features: Includes status tracking (Pending, Success, Failure)
 *    - Example:
 *    ```typescript
 *    class CreateUserCommand extends CommandEvent<UserDTO> {
 *      constructor(userData: UserDTO) {
 *        super('CREATE_USER', userData);
 *      }
 *    }
 *    ```
 *
 * 2. DomainEvent<PayloadDTO>
 *    - Purpose: Represents important domain state changes
 *    - Scope: Internal to a bounded context
 *    - Example:
 *    ```typescript
 *    class UserCreatedEvent extends DomainEvent<User> {
 *      constructor(user: User) {
 *        super('USER_CREATED', user);
 *      }
 *    }
 *    ```
 *
 * 3. IntegrationEvent<PayloadDTO>
 *    - Purpose: Enables communication between bounded contexts
 *    - Scope: Cross-module communication
 *    - Example:
 *    ```typescript
 *    class UserVerifiedEvent extends IntegrationEvent<{userId: string}> {
 *      constructor(userId: string) {
 *        super('USER_VERIFIED', { userId });
 *      }
 *    }
 *    ```
 *
 * 4. ExceptionEvent<T extends Exception>
 *    - Purpose: Standardizes error handling across the system
 *    - Features: Carries structured error information
 *    - Example:
 *    ```typescript
 *    class UserCreationFailedEvent extends ExceptionEvent<UserException> {
 *      constructor(error: UserException) {
 *        super('USER_CREATION_FAILED', error);
 *      }
 *    }
 *    ```
 *
 * Usage Patterns:
 *
 * 1. Command Flow:
 *    ```typescript
 *    // 1. Command issued
 *    const command = new CreateUserCommand(userData);
 *
 *    // 2. Handler processes command
 *    class CreateUserHandler {
 *      async handle(command: CreateUserCommand) {
 *        try {
 *          const user = await this.userService.create(command.payload);
 *          // 3. Domain event published on success
 *          this.eventBus.publish(new UserCreatedEvent(user));
 *        } catch (error) {
 *          // 4. Exception event published on failure
 *          this.eventBus.publish(new UserCreationFailedEvent(error));
 *        }
 *      }
 *    }
 *    ```
 *
 * 2. Cross-Module Communication:
 *    ```typescript
 *    // Users Module
 *    class UserVerifiedHandler {
 *      handle(event: UserVerifiedEvent) {
 *        // Publish integration event for other modules
 *        this.eventBus.publish(new UserVerificationCompletedEvent({
 *          userId: event.payload.userId,
 *          timestamp: new Date()
 *        }));
 *      }
 *    }
 *
 *    // Auth Module
 *    class UserVerificationCompletedHandler {
 *      handle(event: UserVerificationCompletedEvent) {
 *        // Handle verification in auth context
 *        this.authService.enableAccess(event.payload.userId);
 *      }
 *    }
 *    ```
 *
 * Benefits:
 * 1. Type Safety: Full TypeScript support for event payloads
 * 2. Clear Intent: Each event type serves a specific purpose
 * 3. Standardization: Consistent event handling across the system
 * 4. Traceability: Easy to track event flow through the system
 * 5. Maintainability: Clear separation of concerns
 */

import { Event } from './Event';
import { Exception } from './Exception';

export class CommandEvent<PayloadDTO> extends Event<PayloadDTO> {}
export class DomainEvent<PayloadDTO> extends Event<PayloadDTO> {}
export class IntegrationEvent<PayloadDTO> extends Event<PayloadDTO> {}
export class ExceptionEvent<T extends Exception> extends Event<T> {}
