import { Event } from './Event';

export abstract class EventHandler<T extends Event<unknown>> {
  abstract handler(payload: T): void;
}
