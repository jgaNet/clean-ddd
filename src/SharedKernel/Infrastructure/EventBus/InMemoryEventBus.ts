import { EventBus, Event, EventHandler, CommandHandler, IEventEmitter } from '@Primitives';
import { ExecutionContext } from '@Primitives/ExecutionContext';
import { IOperation, OperationStatus } from '@Primitives/Operation';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

export class InMemoryEventBus implements EventBus {
  #eventEmitter: IEventEmitter;

  constructor({ eventEmitter }: { eventEmitter: IEventEmitter }) {
    this.#eventEmitter = eventEmitter;
  }

  async connect() {
    if (this.#eventEmitter instanceof EventEmitter) {
      // eslint-disable-next-line no-console
      console.log(
        '[************************************] [WARN]  In memory event emitter used. No need to connect. Skipping...',
      );
    }
  }

  publish<T>(event: Event<T>, context: ExecutionContext): IOperation<Event<T>> {
    const operation = {
      id: uuidv4(),
      status: OperationStatus.PENDING,
      event,
      createdAt: new Date(),
      finishedAt: undefined,
      result: undefined,
      failed: (_: unknown) => {
        operation.status = OperationStatus.ERROR;
        return operation;
      },
      success: (_: unknown) => {
        operation.status = OperationStatus.SUCCESS;
        return operation;
      },
      sent: () => {
        operation.status = OperationStatus.SENT;
        return operation;
      },
      context,
    };
    this.#eventEmitter.emit(event.name, operation);

    return operation;
  }

  async subscribe<T>(channel: Event<T>['name'], eventHandler: EventHandler<Event<T>> | CommandHandler<Event<T>>) {
    this.#eventEmitter.addListener(channel, async (operation: IOperation<Event<T>>) => {
      await eventHandler.handle.bind(eventHandler)(operation);
    });
  }
}

export const inMemoryEventBus = new InMemoryEventBus({ eventEmitter: new EventEmitter() });
