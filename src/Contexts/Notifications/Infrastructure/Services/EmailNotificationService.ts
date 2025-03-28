import {
  INotificationService,
  NotificationRequest,
} from '@Contexts/Notifications/Domain/Notification/Ports/INotificationService';
import { Notification, NotificationType } from '@Contexts/Notifications/Domain/Notification/Notification';
import { ExecutionContext } from '@SharedKernel/Domain/Application/ExecutionContext';
import { IResult, Result } from '@Contexts/@SharedKernel/Domain';

export class EmailNotificationService implements INotificationService {
  constructor(
    private emailConfig: {
      smtpHost: string;
      smtpPort: number;
      smtpUser: string;
      smtpPass: string;
      fromEmail: string;
    },
  ) {}

  async send(notification: NotificationRequest, context: ExecutionContext): Promise<boolean> {
    if (notification.type !== NotificationType.EMAIL) {
      return false;
    }

    try {
      // Get the recipient's email from metadata or from account repository
      const recipientEmail = notification.metadata?.email;

      if (!recipientEmail) {
        throw new Error('Could not determine recipient email address');
      }

      // Here you would integrate with your email service provider
      context.logger?.info(`[EMAIL SERVICE] Sending email to ${recipientEmail}`, { traceId: context.traceId });
      context.logger?.info(`[EMAIL SERVICE] Subject: ${notification.title}`, { traceId: context.traceId });
      context.logger?.info(`[EMAIL SERVICE] Content: ${notification.content}`, { traceId: context.traceId });

      // In a real implementation, you would:
      // 1. Format the email with proper HTML/text
      // 2. Send through your email provider (e.g., Nodemailer, SES, SendGrid)
      // 3. Handle errors and retries

      // Simulating successful sending
      return true;
    } catch (error) {
      context.logger?.error('[EMAIL SERVICE] Failed to send email notification:', error);
      return false;
    }
  }

  // WARNING: The channel is always available for the moment
  async sendViaChannel(
    notification: Notification,
    type: NotificationType = NotificationType.EMAIL,
    context: ExecutionContext,
  ): Promise<IResult<void>> {
    if (type !== NotificationType.EMAIL) {
      return Result.fail('Invalid notification type');
    }

    this.send(notification, context);
    return Result.ok();
  }

  // WARNING: The channel is always available for the moment
  async isChannelAvailable(_: string, __: NotificationType): Promise<boolean> {
    return true;
  }
}
