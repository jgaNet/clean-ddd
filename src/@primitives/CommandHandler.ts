import { Event } from './Event';
import { EventHandler } from './EventHandler';
import { Result } from './Result';

export abstract class CommandHandler<T extends Event<unknown>> extends EventHandler<T> {
  abstract execute(payload: T): Promise<Result>;
}
