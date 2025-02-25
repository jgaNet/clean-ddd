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

  dispatch<T>(event: Event<T>): Operation<Event<T>> {
    const operation = new Operation({
      event,
    });
    this.#eventEmitter.emit(operation.name, operation.event);
    return operation;
  }

  async subscribe<T>(channel: Event<T>['name'], eventHandler: EventHandler<Event<T>>) {
    this.#eventEmitter.addListener(channel, eventHandler.execute.bind(eventHandler));
  }
}
