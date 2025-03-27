import { CommandHandler } from '@SharedKernel/Domain/Application/CommandHandler';
import { Result, IResult } from '@SharedKernel/Domain/Application/Result';
import { ExecutionContext } from '@SharedKernel/Domain/Application/ExecutionContext';
import { Role } from '@SharedKernel/Domain/AccessControl/Role';
import { SendNotificationCommandEvent } from './SendNotificationCommandEvent';
import { INotificationRepository } from '@Contexts/Notifications/Domain/Notification/Ports/INotificationRepository';
import { INotificationService } from '@Contexts/Notifications/Domain/Notification/Ports/INotificationService';
import { Notification, NotificationType } from '@Contexts/Notifications/Domain/Notification/Notification';
import { NotificationSentEvent } from '@Contexts/Notifications/Domain/Notification/Events/NotificationSentEvent';
import { NotAllowedException } from '@SharedKernel/Domain/Application/CommonExceptions';
import { DeliveryStrategy } from '@Contexts/Notifications/Domain/Notification/DeliveryStrategy';

export class SendNotificationCommandHandler extends CommandHandler<SendNotificationCommandEvent> {
  constructor(
    private notificationRepository: INotificationRepository,
    private notificationServices: INotificationService[],
  ) {
    super();
  }

  protected async guard({ payload }: SendNotificationCommandEvent, { auth }: ExecutionContext): Promise<IResult> {
    // Manual notifications should only be sent by admins
    if (payload.isManual) {
      if (!auth.role || ![Role.ADMIN].includes(auth.role)) {
        return Result.fail(
          new NotAllowedException('Notifications', 'Only administrators can send manual notifications'),
        );
      }
    }
    return Result.ok();
  }

  async execute({ payload }: SendNotificationCommandEvent, context: ExecutionContext): Promise<IResult<string>> {
    try {
      context.logger?.info(`Sending notification to ${payload.recipientId} of type ${payload.type}`, {
        traceId: context.traceId,
      });

      // Create notification entity
      const notificationResult = Notification.create({
        id: await this.notificationRepository.nextIdentity(),
        recipientId: payload.recipientId,
        deliveryStrategy: DeliveryStrategy.custom([]), // WARNING: The channel is always available for the moment
        type: payload.type,
        title: payload.title,
        content: payload.content,
        metadata: payload.metadata,
      });

      if (notificationResult.isFailure()) {
        return Result.fail(notificationResult.error);
      }

      const notification = notificationResult.data;

      // Find the appropriate notification service
      const service = this.notificationServices.find(s =>
        s.constructor.name.toLowerCase().includes(notification.type.toLowerCase()),
      );

      if (!service) {
        notification.markAsFailed();
        await this.notificationRepository.save(notification);
        return Result.fail(new Error(`No service available for notification type: ${notification.type}`));
      }

      // Send notification
      const success = await service.send(
        {
          recipientId: notification.recipientId,
          deliveryStrategy: notification.deliveryStrategy,
          type: notification.type,
          title: notification.title,
          content: notification.content,
          metadata: notification.metadata,
        },
        context,
      );

      if (success) {
        notification.markAsSent(NotificationType.WEBSOCKET);

        // Publish domain event using context.eventBus
        context.eventBus.publish(
          NotificationSentEvent.set({
            notificationId: notification._id.value,
            recipientId: notification.recipientId,
            type: notification.type,
            title: notification.title,
          }),
          context,
        );
      } else {
        notification.markAsFailed();
      }

      // Save notification
      await this.notificationRepository.save(notification);

      // Return ID
      return Result.ok(notification._id.value);
    } catch (error) {
      context.logger?.error(`Failed to send notification: ${(error as Error).message}`, { traceId: context.traceId });
      return Result.fail(error);
    }
  }
}
