import { Event } from '@Primitives/Event';
import { EventHandler } from '@Primitives/EventHandler';
export interface EventBus {
  connect(): Promise<void>;
  dispatch<T>(EventClass: typeof Event<T>, payload: T): void;
  subscribe<T>(EventClass: typeof Event<T>, eventHandler: EventHandler<Event<T>>): Promise<void>;
}
