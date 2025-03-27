import { v4 as uuidv4 } from 'uuid';
import { ExecutionContext, IResult, Result } from '@SharedKernel/Domain/Application';
import { Notification, NotificationType } from '@Contexts/Notifications/Domain/Notification/Notification';
import {
  INotificationService,
  NotificationRequest,
} from '@Contexts/Notifications/Domain/Notification/Ports/INotificationService';
import { INotificationRepository } from '@Contexts/Notifications/Domain/Notification/Ports/INotificationRepository';
import { EmailNotificationService } from './EmailNotificationService';
import { IWebSocketService } from './WebSocketService';

export class NotificationDeliveryService implements INotificationService {
  private readonly channelServices: Map<NotificationType, unknown> = new Map();

  constructor(
    private webSocketService: IWebSocketService,
    private emailService: EmailNotificationService,
    private notificationRepository: INotificationRepository,
  ) {
    // Register available channel services
    this.channelServices.set(NotificationType.WEBSOCKET, webSocketService);
    this.channelServices.set(NotificationType.EMAIL, emailService);
  }

  async send(request: NotificationRequest, context: ExecutionContext): Promise<boolean> {
    const { recipientId, type, title, content, deliveryStrategy, metadata } = request;

    // Create the notification entity
    const notificationResult = Notification.create({
      id: uuidv4(),
      recipientId,
      type,
      title,
      content,
      deliveryStrategy,
      metadata,
    });

    if (notificationResult.isFailure()) {
      context.logger?.error('Failed to create notification entity', { error: notificationResult.error });
      return false;
    }

    const notification = notificationResult.data;

    // Save initial notification
    await this.notificationRepository.save(notification);

    // Try each delivery channel in the strategy
    let success = false;

    // Start with the first channel in the strategy
    const channels = notification.deliveryStrategy.getChannels();

    for (const channelType of channels) {
      // Check if channel is available
      const isAvailable = await this.isChannelAvailable(notification.recipientId, channelType);

      if (!isAvailable) {
        context.logger?.info(
          `Channel ${channelType} not available for recipient ${notification.recipientId}, skipping`,
        );
        notification.recordDeliveryAttempt(channelType, false);
        continue;
      }

      // Try to send through this channel
      const result = await this.sendViaChannel(notification, channelType, context);

      if (result.isSuccess()) {
        // Mark notification as sent through this channel
        notification.markAsSent(channelType);
        success = true;
        break; // Stop trying other channels
      }
    }

    // If no channel succeeded, mark as failed
    if (!success) {
      notification.markAsFailed();
    }

    // Save final notification state
    await this.notificationRepository.save(notification);

    return success;
  }

  async sendViaChannel(
    notification: Notification,
    type: NotificationType,
    context: ExecutionContext,
  ): Promise<IResult<void>> {
    let result: IResult<void>;

    try {
      switch (type) {
        case NotificationType.WEBSOCKET:
          result = await this.webSocketService.sendToUser(notification.recipientId, notification);
          break;

        case NotificationType.EMAIL:
          result = await this.sendEmail(notification, context);
          break;

        default:
          return Result.fail(new Error(`Unsupported notification type: ${type}`));
      }

      // Record the delivery attempt
      notification.recordDeliveryAttempt(type, result.isSuccess());
      return result;
    } catch (error) {
      notification.recordDeliveryAttempt(type, false);
      return Result.fail(error);
    }
  }

  async isChannelAvailable(recipientId: string, type: NotificationType): Promise<boolean> {
    switch (type) {
      case NotificationType.WEBSOCKET:
        return this.webSocketService.isUserConnected(recipientId);

      case NotificationType.EMAIL:
        // Assume email is always available if we have the address
        return true;

      default:
        return false;
    }
  }

  private async sendEmail(notification: Notification, context: ExecutionContext): Promise<IResult<void>> {
    try {
      const emailSent = await this.emailService.send(
        {
          recipientId: notification.recipientId,
          type: NotificationType.EMAIL,
          title: notification.title,
          content: notification.content,
          deliveryStrategy: notification.deliveryStrategy,
          metadata: notification.metadata,
        },
        context,
      );

      return emailSent ? Result.ok() : Result.fail(new Error('Email delivery failed'));
    } catch (error) {
      return Result.fail(error);
    }
  }
}
