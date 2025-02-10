import { Exception } from '@Primitives/Exception';
import { EventBus } from '@Primitives/EventBus';
import { ExceptionEvent } from '@Primitives/EventTypes';
import { ExceptionHandler } from '@Primitives/ExceptionHandler';

export class AsyncExceptionHandler extends ExceptionHandler {
  #eventBus: EventBus;

  constructor({ eventBus }: { eventBus: EventBus }) {
    super();
    this.#eventBus = eventBus;
  }

  async throw(Event: typeof ExceptionEvent<Exception>, error: Exception): Promise<void> {
    // eslint-disable-next-line no-console
    console.error(error);
    this.#eventBus.dispatch(Event, error);
  }
}
