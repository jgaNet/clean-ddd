/**
 * EventBus is a core primitive interface that defines the contract for event bus implementations
 * in the application's event-driven architecture.
 *
 * This interface serves as the foundation for different event bus implementations
 * (e.g., InMemoryEventBus, KafkaEventBus) enabling event-driven communication across the system.
 *
 * Key characteristics:
 * - Provides type-safe event dispatch and subscription methods
 * - Supports asynchronous connection management
 * - Used by Module class for event handling orchestration
 * - Enables loose coupling between event publishers and subscribers
 *
 * Core methods:
 * - connect(): Establishes connection to the event bus infrastructure
 * - dispatch(): Publishes events to subscribed handlers
 * - subscribe(): Registers event handlers for specific event types
 *
 * Usage in the project:
 * - Used by CommandHandlers for publishing domain events
 * - Implements different transport mechanisms (in-memory, Kafka)
 * - Supports both domain and integration events
 * - Used in UsersManager and other modules for event-driven operations
 */

import { Event } from '@Primitives/Event';
import { EventHandler } from '@Primitives/EventHandler';
export interface EventBus {
  connect(): Promise<void>;
  dispatch<T>(EventClass: typeof Event<T>, payload: T): void;
  subscribe<T>(EventClass: typeof Event<T>, eventHandler: EventHandler<Event<T>>): Promise<void>;
}
