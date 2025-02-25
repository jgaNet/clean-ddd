import { EventBus, Event, EventHandler, Operation } from '@Primitives';

import EventEmitter from 'events';

export class InMemoryEventBus implements EventBus {
  #eventEmitter: EventEmitter;

  constructor() {
    this.#eventEmitter = new EventEmitter();
  }

  async connect() {
    // eslint-disable-next-line no-console
    console.log('[sys][warning] InMemoryBroker used');
  }

  dispatch<T>(EventClass: typeof Event<T>, eventPayload: T): Operation<Event<T>> {
    const event = new EventClass(eventPayload);
    this.#eventEmitter.emit(EventClass.name, event);
    return new Operation(event);
  }

  async subscribe<T>(EventClass: typeof Event<T>, eventHandler: EventHandler<Event<T>>) {
    this.#eventEmitter.addListener(EventClass.name, eventHandler.execute.bind(eventHandler));
  }
}
