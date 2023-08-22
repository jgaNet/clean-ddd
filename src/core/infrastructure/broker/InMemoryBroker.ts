import { EventBus } from '@primitives/EventBus';
import { Event } from '@primitives/Event';
import { EventHandler } from '@primitives/EventHandler';

import EventEmitter from 'events';

export class InMemoryBroker implements EventBus {
  #eventEmitter: EventEmitter;

  constructor() {
    this.#eventEmitter = new EventEmitter();
  }

  async connect() {
    console.log('[sys][warning] InMemoryBroker used');
  }

  dispatch<T>(EventClass: typeof Event<T>, eventPayload: T) {
    this.#eventEmitter.emit(EventClass.name, new EventClass(eventPayload));
  }

  async subscribe<T>(EventClass: typeof Event<T>, eventHandler: EventHandler<Event<T>>) {
    this.#eventEmitter.addListener(EventClass.name, eventHandler.handler);
  }
}
