import { EventBus } from '@primitives/EventBus';
import { Event } from '@primitives/Event';
import { EventHandler } from '@primitives/EventHandler';

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

  dispatch<T>(EventClass: typeof Event<T>, eventPayload: T) {
    this.#eventEmitter.emit(EventClass.name, new EventClass(eventPayload));
  }

  async subscribe<T>(EventClass: typeof Event<T>, eventHandler: EventHandler<Event<T>>) {
    this.#eventEmitter.addListener(EventClass.name, eventHandler.execute.bind(eventHandler));
  }
}
