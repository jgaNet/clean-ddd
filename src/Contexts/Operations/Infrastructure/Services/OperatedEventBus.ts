import { EventBus, Event, EventHandler, CommandHandler, IEventEmitter } from '@Primitives';
import { ExecutionContext } from '@Primitives/ExecutionContext';
import { Operation, IOperationRepository } from '@Contexts/Operations/Domain/Operation';
import EventEmitter from 'events';

export class OperatedEventBus implements EventBus {
  #eventEmitter: IEventEmitter;
  #operationRepository: IOperationRepository | undefined;

  constructor({
    eventEmitter,
    operationRepository,
  }: {
    eventEmitter: IEventEmitter;
    operationRepository?: IOperationRepository;
  }) {
    this.#eventEmitter = eventEmitter;
    this.#operationRepository = operationRepository;
  }

  async connect() {
    if (this.#eventEmitter instanceof EventEmitter) {
      // eslint-disable-next-line no-console
      console.log('[sys][warning] In memory event emitter used. No need to connect. Skipping...');
    }
  }

  dispatch<T>(event: Event<T>, context: ExecutionContext): Operation<Event<T>> {
    // Create operation with execution context if available
    const operation = Operation.create<T>({
      event,
      context,
    });

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
