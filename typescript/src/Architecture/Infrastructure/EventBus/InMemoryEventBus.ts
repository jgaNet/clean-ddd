import { v4 as uuidv4 } from 'uuid';

import { Event, Result } from '@Architecture/Domain';
import {
  CommandHandler,
  EventBus,
  EventHandler,
  ExecutionContext,
  IEventEmitter,
  IOperation,
  OperationStatus,
} from '@Architecture/Application';

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

  /** Nothing to connect to: the emitter is in this process. */
  async connect() {}

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
    // The channel is the event's name: what arrives on it is that event, which the emitter cannot know.
    this.#eventEmitter.addListener(channel, operation => eventHandler.handle(operation as IOperation<Event<T>>));
  }
}
