import { Event } from './Event';
import { EventHandler } from './EventHandler';
export interface EventBus {
  dispatch<T>(EventClass: typeof Event<T>, payload: T): void;
  subscribe<T>(EventClass: typeof Event<T>, eventHandler: EventHandler<Event<T>>): void;
}
