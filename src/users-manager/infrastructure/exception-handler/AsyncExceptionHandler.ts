import { Exception } from '@primitives/Exception';
import { EventBus } from '@primitives/EventBus';
import { ExceptionEvent } from '@primitives/EventTypes';
import { ExceptionHandler } from '@primitives/ExceptionHandler';

export class AsyncExceptionHandler extends ExceptionHandler {
  #eventBus: EventBus;

  constructor({ eventBus }: { eventBus: EventBus }) {
    super();
    this.#eventBus = eventBus;
  }

  async throw(Event: typeof ExceptionEvent<Error>, error: Exception): Promise<void> {
    // eslint-disable-next-line no-console
    console.error(error);
    this.#eventBus.dispatch(Event, error);
  }
}
