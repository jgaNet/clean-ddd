/**
 * EventTypes defines the core event type hierarchy used throughout the application's
 * event-driven architecture. Each event type serves a specific purpose in different
 * layers of the system.
 *
 * Event Type Hierarchy:
 * - CommandEvent: Represents requests to change system state (e.g., CreateUserCommand)
 * - DomainEvent: Represents important changes within a domain (e.g., UserCreatedEvent)
 * - IntegrationEvent: Represents events shared between different bounded contexts
 * - ExceptionEvent: Represents error conditions and exceptional situations
 *
 * Key characteristics:
 * - All types extend the base Event<PayloadDTO> class
 * - Type-safe payload handling through generics
 * - Clear separation of concerns through distinct event types
 * - Used extensively in the Module and EventBus infrastructure
 *
 * Usage in the project:
 * - CommandEvent: Used in CommandHandlers for operation requests
 * - DomainEvent: Used in domain logic for state change notifications
 * - IntegrationEvent: Used for cross-module communication
 * - ExceptionEvent: Used by ExceptionHandlers for error management
 */

import { Event } from './Event';
import { Exception } from './Exception';
export class CommandEvent<PayloadDTO> extends Event<PayloadDTO> {}
export class DomainEvent<PayloadDTO> extends Event<PayloadDTO> {}
export class IntegrationEvent<PayloadDTO> extends Event<PayloadDTO> {}
export class ExceptionEvent<T extends Exception> extends Event<T> {}
