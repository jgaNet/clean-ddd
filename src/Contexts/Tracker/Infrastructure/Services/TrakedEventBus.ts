import {
  EventBus,
  Event,
  EventHandler,
  CommandHandler,
  IEventEmitter,
  ExecutionContext,
  IOperation,
} from '@SharedKernel/Domain';
import { ITrackedOperationRepository, TrackedOperation } from '@Contexts/Tracker/Domain/TrackedOperation';
import { OperationCompleteIntegrationEvent } from '@SharedKernel/Application/IntegrationEvents/TrackerIntegrationEvents';
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
    // Save the operation
    if (this.#operationRepository) {
      this.#operationRepository.save(operation);
    }

    // If this is a regular domain event, emit it normally
    this.#eventEmitter.emit(operation.event.name, operation);

    // If user is authenticated, also emit operation complete event for WebSocket notifications
    if (context?.auth?.subjectId) {
      this.publishOperationCompleteEvent(operation, context);
    }

    return operation;
  }

  async subscribe<T>(channel: Event<T>['name'], eventHandler: EventHandler<Event<T>> | CommandHandler<Event<T>>) {
    this.#eventEmitter.addListener(channel, async (operation: TrackedOperation<Event<T>>) => {
      try {
        // Handle the event
        const operationResult = await eventHandler.handle.bind(eventHandler)(operation);

        // If this is an operation complete event, skip it because of infinite loop
        if (operation.event.name === OperationCompleteIntegrationEvent.name) {
          return;
        }

        await this.#operationRepository?.save(operationResult);

        // If this was the last step in a chain, notify about completion
        if (operation.context?.auth?.subjectId) {
          this.publishOperationCompleteEvent(operationResult, operation.context);
        }
      } catch (error) {
        // Mark operation as failed
        const failedOperation = operation.failed(error);

        // Save the failed operation
        await this.#operationRepository?.save(failedOperation);

        // If this operation is being awaited, notify about failure
        if (operation.context?.auth?.subjectId) {
          this.publishOperationCompleteEvent(failedOperation, operation.context);
        }
      }
    });
  }

  private publishOperationCompleteEvent<T>(operation: IOperation<Event<T>>, context: ExecutionContext): void {
    try {
      const operationCompleteEvent = new OperationCompleteIntegrationEvent({
        payload: {
          operationId: operation.id,
          userId: context.auth?.subjectId || 'anonymous',
          success: operation.result?.isSuccess() ?? false,
          type: operation.event.name,
          result: operation.result?.data,
          error: operation.result?.isFailure() ? operation.result.error?.message || 'Unknown error' : undefined,
        },
      });

      // Emit the operation complete event
      this.#eventEmitter.emit(
        operationCompleteEvent.constructor.name,
        TrackedOperation.create({
          event: operationCompleteEvent,
          context,
        }),
      );
    } catch (error) {
      context.logger?.error('Failed to publish operation complete event:', error);
    }
  }
}
