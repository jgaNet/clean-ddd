import { EventBus, Event, EventHandler, CommandHandler, IEventEmitter } from '@Primitives';
import { ExecutionContext } from '@Primitives/ExecutionContext';
import { ITrackedOperationRepository, TrackedOperation } from '@Contexts/Tracker/Domain/TrackedOperation';
import EventEmitter from 'events';

export class TrakedEventBus implements EventBus {
  #eventEmitter: IEventEmitter;
  #operationRepository: ITrackedOperationRepository;

  constructor({
    eventEmitter,
    operationRepository,
  }: {
    eventEmitter: IEventEmitter;
    operationRepository: ITrackedOperationRepository;
  }) {
    this.#eventEmitter = eventEmitter;
    this.#operationRepository = operationRepository;
  }

  async connect() {
    if (this.#eventEmitter instanceof EventEmitter) {
      // eslint-disable-next-line no-console
      console.log(
        '[************************************] [WARN]  In memory event emitter used. No need to connect. Skipping...',
      );
    }
  }

  publish<T>(event: Event<T>, context: ExecutionContext): TrackedOperation<Event<T>> {
    // Create operation with execution context if available
    const operation = TrackedOperation.create<T>({
      event,
      context,
    });

    if (this.#operationRepository) {
      this.#operationRepository.save(operation);
    }

    this.#eventEmitter.emit(operation.event.name, operation);
    return operation;
  }

  async subscribe<T>(channel: Event<T>['name'], eventHandler: EventHandler<Event<T>> | CommandHandler<Event<T>>) {
    this.#eventEmitter.addListener(channel, async (operation: TrackedOperation<Event<T>>) => {
      const op = await eventHandler.handle.bind(eventHandler)(operation);
      this.#operationRepository?.save(op as TrackedOperation<Event<T>>);
    });
  }
}
