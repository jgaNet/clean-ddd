import { EventBus, Event, EventHandler, CommandHandler } from '@Primitives';
import { Operation } from '@Contexts/Operations/Domain/Operation';

import EventEmitter from 'events';
import { InMemoryOperationRepository } from '@Contexts/Operations/Infrastructure/Repositories/InMemoryOperationRepository';

export class InMemoryEventBus implements EventBus {
  #eventEmitter: EventEmitter;
  #operationRepository: InMemoryOperationRepository | undefined;

  constructor(inMemoryOperationRepository?: InMemoryOperationRepository) {
    this.#eventEmitter = new EventEmitter();
    this.#operationRepository = inMemoryOperationRepository;
  }

  async connect() {
    // eslint-disable-next-line no-console
    console.log('[sys][warning] InMemoryBroker used');
  }

  dispatch<T>(event: Event<T>): Operation<Event<T>> {
    const operation = Operation.create<T>({ event, eventBus: this });
    if (this.#operationRepository) {
      this.#operationRepository.save(operation);
    }
    this.#eventEmitter.emit(operation.name, operation);
    return operation;
  }

  async subscribe<T>(channel: Event<T>['name'], eventHandler: EventHandler<Event<T>> | CommandHandler<Event<T>>) {
    this.#eventEmitter.addListener(channel, async (operation: Operation<Event<T>>) => {
      this.#operationRepository?.save(await eventHandler.handle.bind(eventHandler)(operation));
    });
  }
}
