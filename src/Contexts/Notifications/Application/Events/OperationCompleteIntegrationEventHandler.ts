import { IResult, Result } from '@SharedKernel/Domain';
import { EventHandler, ExecutionContext, OperationStatus } from '@SharedKernel/Application';
import { OperationCompleteIntegrationEvent } from '@SharedKernel/Application/IntegrationEvents/TrackerIntegrationEvents';

import { Channel } from '@Contexts/Notifications/Domain/Notification/Channel';
import { NotificationDelivery } from '@Contexts/Notifications/Application/Services/NotificationDelivery';

/**
 * Anti-corruption layer towards Tracker: the caller of an asynchronous command learns how
 * it went, live, over the websocket. Only the outcomes are worth a notification.
 */
export class OperationCompleteIntegrationEventHandler extends EventHandler<OperationCompleteIntegrationEvent> {
  constructor(private delivery: NotificationDelivery) {
    super();
  }

  async execute({ payload }: OperationCompleteIntegrationEvent, context: ExecutionContext): Promise<IResult<unknown>> {
    const { operationId, userId, status, type, result, error } = payload;

    const wording: Partial<Record<OperationStatus, { title: string; content: string }>> = {
      [OperationStatus.SUCCESS]: {
        title: `Operation complete: ${type}`,
        content: `Your operation ${operationId} succeeded.`,
      },
      [OperationStatus.ERROR]: {
        title: `Operation failed: ${type}`,
        content: `Your operation ${operationId} failed: ${error ?? 'unknown error'}`,
      },
    };
    const words = wording[status];
    if (!words) return Result.ok(); // not an outcome (PENDING, SENT): nothing to tell the user yet

    return this.delivery.deliver(
      {
        recipientId: userId,
        ...words,
        channels: [Channel.WEBSOCKET],
        metadata: { operationId, type, status, ...(result !== undefined && { result }), ...(error && { error }) },
      },
      context,
    );
  }
}
