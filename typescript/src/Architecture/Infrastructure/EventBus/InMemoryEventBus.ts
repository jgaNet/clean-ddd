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
 * a reaction that failed is handed the message again, which is what at-least-once is for. An
 * operation's `delivered` settles once every reaction it started has finished, and says whether
 * all of them succeeded: the outbox's relay acknowledges an entry on it, and on nothing sooner.
 */
export class InMemoryEventBus implements EventBus {
  #eventEmitter: IEventEmitter;
  /** Per subscription, the ids of the messages it handled: the inbox. */
  #delivered: Map<number, Set<string>> = new Map();
  /** While a message is emitted, the reactions it starts: what its `delivered` waits for. */
  #reactions = new Map<IOperation<Event<unknown>>, Promise<boolean>[]>();
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

    // The listeners run during emit(): each one that starts a reaction adds it here.
    const reactions: Promise<boolean>[] = [];
    this.#reactions.set(operation, reactions);
    try {
      this.#eventEmitter.emit(event.name, operation);
    } finally {
      this.#reactions.delete(operation);
    }
    operation.delivered = Promise.all(reactions).then(each => each.every(Boolean));

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
      // Each subscriber's own verdict: the operation is one for every subscriber, so its status
      // says how the last of them ended, not how this one did. A delivery is the operation, with
      // `failed` noting that this subscriber failed.
      let succeeded = true;
      const delivery: IOperation<Event<T>> = Object.assign(Object.create(operation) as IOperation<Event<T>>, {
        failed: (error: unknown) => {
          succeeded = false;
          return operation.failed(error);
        },
      });
      const reaction = eventHandler.handle(delivery).then(
        () => {
          if (succeeded) inbox.add(operation.id);
          return succeeded;
        },
        () => false,
      );
      this.#reactions.get(operation as IOperation<Event<unknown>>)?.push(reaction);
    });
  }
}
