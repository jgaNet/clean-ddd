import { Event } from './Event';
import { ResultValue } from './Result';

export abstract class EventHandler<T extends Event<unknown>> {
  abstract execute(payload: T): Promise<ResultValue>;
}
