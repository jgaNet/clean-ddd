import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

import { Event, Result } from '@SharedKernel/Domain';
import {
  CommandHandler,
  EventBus,
  EventHandler,
  ExecutionContext,
  IEventEmitter,
  IOperation,
  OperationStatus,
} from '@SharedKernel/Application';

/**
 * A process-local bus on top of Node's EventEmitter. Publishing returns an Operation whose
 * status and result the handler fills in; the Tracker context records those (see
 * Contexts/Tracker/Infrastructure/TrackedEventBus.ts, which decorates this bus).
 */
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
    const operation: IOperation<Event<T>> = {
      id: uuidv4(),
      status: OperationStatus.PENDING,
      event,
      context,
      createdAt: new Date(),
      failed: error => {
        operation.status = OperationStatus.ERROR;
        operation.result = Result.fail(error);
        operation.finishedAt = new Date();
        return operation;
      },
      success: value => {
        operation.status = OperationStatus.SUCCESS;
        operation.result = Result.ok(value);
        operation.finishedAt = new Date();
        return operation;
      },
      sent: () => {
        operation.status = OperationStatus.SENT;
        return operation;
      },
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
