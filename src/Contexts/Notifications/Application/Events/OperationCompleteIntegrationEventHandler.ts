import { ExecutionContext, EventHandler } from '@SharedKernel/Domain/Application';
import { OperationCompleteIntegrationEvent } from '@SharedKernel/Application/IntegrationEvents/TrackerIntegrationEvents';
import { NotificationType } from '@Contexts/Notifications/Domain/Notification/Notification';
import { DeliveryStrategy } from '@Contexts/Notifications/Domain/Notification/DeliveryStrategy';
import { INotificationService } from '@Contexts/Notifications/Domain/Notification/Ports/INotificationService';
import { IResult, OperationStatus, Result } from '@SharedKernel/Domain';

export class OperationCompleteIntegrationEventHandler extends EventHandler<OperationCompleteIntegrationEvent> {
  constructor(private notificationService: INotificationService) {
    super();
  }

  async execute(event: OperationCompleteIntegrationEvent, context: ExecutionContext): Promise<IResult<void>> {
    const { operationId, userId, status, type, result, error } = event.payload;

    const success = [OperationStatus.SENT, OperationStatus.SUCCESS].includes(status);
    const pending = [OperationStatus.PENDING].includes(status);
    const failed = [OperationStatus.ERROR].includes(status);

    if (!success && !pending && !failed) {
      return Result.fail(`Invalid operation status: ${status}`);
    }

    if (status === OperationStatus.SENT) {
      return Result.fail('Sent operations cannot be notified');
    }

    // Create notification title based on operation status
    const title = pending
      ? `Operation Pending: ${type}`
      : success
      ? `Operation Complete: ${type}`
      : `Operation Failed: ${type}`;

    // Create notification content
    const content = pending
      ? `Your operation ${operationId} of type ${type} is pending.`
      : success
      ? `Your operation ${operationId} of type ${type} has completed successfully.`
      : `Your operation ${operationId} of type ${type} has failed: ${error || 'Unknown error'}`;

    // Create WebSocket-only strategy
    const deliveryStrategy = DeliveryStrategy.websocketOnly();

    // Send notification using the service
    await this.notificationService.send(
      {
        recipientId: userId,
        type: NotificationType.WEBSOCKET,
        title,
        content,
        deliveryStrategy,
        metadata: {
          operationId,
          type,
          status,
          ...((result && { result }) as object),
          ...(error && { error }),
        },
      },
      context,
    );

    return Result.ok();
  }
}
