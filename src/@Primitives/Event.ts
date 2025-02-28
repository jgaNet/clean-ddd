/**
 * Event is a primitive class that represents the foundation for all events in the application's event system.
 *
 * This class is a core building block in the event-driven architecture, used across different contexts
 * like UsersManager and works with various event bus implementations (InMemoryEventBus, KafkaEventBus).
 *
 * Key characteristics:
 * - Generic type PayloadDTO allows for type-safe event payloads
 * - Private field #payload ensures immutability of event data
 * - Used by both domain and integration events
 * - Compatible with different event bus implementations
 *
 * Core features:
 * - Immutable payload: Once created, event data cannot be modified
 * - Type safety: Ensures payload type consistency at compile time
 * - Encapsulation: Payload is private with controlled access through getter
 *
 * Usage examples in the project:
 * - Command events (CreateUserCommandEvent)
 * - Domain events (UserCreatedEvent)
 * - Integration events
 * - Exception events for error handling
 */

export type IEvent<PayloadDTO> = {
  payload: PayloadDTO;
  name: string;
};

export class Event<PayloadDTO> {
  #payload: PayloadDTO;

  constructor(payload: PayloadDTO) {
    this.#payload = payload;
  }

  get payload(): PayloadDTO {
    return this.#payload;
  }

  get name(): string {
    return this.constructor.name;
  }
}
