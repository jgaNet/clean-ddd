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
 *
 * Delivery is idempotent per subscriber (ADR 24): a message relayed from the outbox carries its
 * entry's id, and a subscriber that already handled that id — and did not fail — is not handed
 * it again. The inbox is the bus's, not each handler's, so a reaction stays a plain `execute()`;
 * a reaction that failed is handed the message again, which is what at-least-once is for.
 */
export class InMemoryEventBus implements EventBus {
  #eventEmitter: IEventEmitter;
  /** Per subscription, the ids of the messages it handled: the inbox. */
  #delivered: Map<number, Set<string>> = new Map();
  #subscriptions = 0;

  constructor({ eventEmitter }: { eventEmitter: IEventEmitter }) {
    this.#eventEmitter = eventEmitter;
  }

  /** Nothing to connect to: the emitter is in this process. */
  async connect() {}

  publish<T>(event: Event<T>, context: ExecutionContext, messageId?: string): IOperation<Event<T>> {
    const operation: IOperation<Event<T>> = {
      id: messageId ?? uuidv4(),
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
    const subscription = this.#subscriptions++;
    const inbox = new Set<string>();
    this.#delivered.set(subscription, inbox);
    // The channel is the event's name: what arrives on it is that event, which the emitter cannot know.
    this.#eventEmitter.addListener(channel, emitted => {
      const operation = emitted as IOperation<Event<T>>;
      if (inbox.has(operation.id)) {
        operation.sent();
        return;
      }
      void eventHandler.handle(operation).then(done => {
        if (done.status !== OperationStatus.ERROR) inbox.add(operation.id);
      });
    });
  }
}
