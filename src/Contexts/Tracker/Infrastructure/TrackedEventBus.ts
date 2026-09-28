import { CommandEvent, Event, IResult } from '@SharedKernel/Domain';
import { EventBus, EventHandler, ExecutionContext, IOperation } from '@SharedKernel/Application';
import { OperationCompleteIntegrationEvent } from '@SharedKernel/Application/IntegrationEvents/TrackerIntegrationEvents';

import { IOperationRecords } from '@Contexts/Tracker/Application/Ports/IOperationRecords';
import { toOperationRecord } from '@Contexts/Tracker/Application/Projections/OperationProjection';

/**
 * Decorates any EventBus so that every operation it carries is projected into the
 * Tracker records, when published (PENDING) and again once handled (SUCCESS / ERROR / SENT).
 * For a command sent by an authenticated caller it also publishes
 * OperationCompleteIntegrationEvent, which the
 * Notifications context turns into a live notification.
 *
 * Tracking is a cross-cutting concern: the inner bus does not know it is being watched, and
 * the handlers do not know they are being recorded.
 */
export class TrackedEventBus implements EventBus {
  constructor(private bus: EventBus, private records: IOperationRecords) {}

  connect(): Promise<void> {
    return this.bus.connect();
  }

  publish<T>(event: Event<T>, context: ExecutionContext): IOperation<Event<T>> {
    const operation = this.bus.publish(event, context);
    void this.track(operation);
    return operation;
  }

  subscribe<T>(channel: Event<T>['name'], handler: EventHandler<Event<T>>): Promise<void> {
    return this.bus.subscribe(channel, new RecordedHandler(handler, operation => this.track(operation)));
  }

  private async track<T>(operation: IOperation<Event<T>>): Promise<void> {
    // The completion notice is about an operation; it is not one worth tracking itself.
    if (operation.event.name === OperationCompleteIntegrationEvent.name) return;

    try {
      await this.records.save(toOperationRecord(operation));
      // Only a command is something a client asked for and waits on. Domain and integration
      // events are recorded for the trace but never announced: announcing them would notify
      // about the notification, which is itself an event, and so on without end.
      if (operation.context.auth.subjectId && operation.event instanceof CommandEvent) {
        this.notifyCompletion(operation);
      }
    } catch (error) {
      operation.context.logger?.error('Failed to track operation', error, { operationId: operation.id });
    }
  }

  private notifyCompletion<T>(operation: IOperation<Event<T>>): void {
    const { context, result } = operation;
    this.bus.publish(
      OperationCompleteIntegrationEvent.set({
        operationId: operation.id,
        userId: context.auth.subjectId as string,
        status: operation.status,
        type: operation.event.name,
        result: result?.isSuccess() ? result.data : undefined,
        error: result?.isFailure() ? result.error.message : undefined,
      }),
      context,
    );
  }
}

/** Runs the real handler, then reports the finished operation; a throw becomes a failed operation. */
class RecordedHandler<T extends Event<unknown>> extends EventHandler<T> {
  constructor(private inner: EventHandler<T>, private report: (operation: IOperation<T>) => Promise<void>) {
    super();
  }

  async handle(operation: IOperation<T>): Promise<IOperation<T>> {
    let done: IOperation<T>;
    try {
      done = await this.inner.handle(operation);
    } catch (error) {
      done = operation.failed(error);
    }
    await this.report(done);
    return done;
  }

  execute(event: T, context: ExecutionContext): Promise<IResult<unknown>> {
    return this.inner.execute(event, context);
  }
}
