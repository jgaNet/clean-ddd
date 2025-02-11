import { Event } from './Event';

export abstract class EventHandler<T extends Event<unknown>> {
  abstract execute(payload: T): Promise<unknown>;
}
