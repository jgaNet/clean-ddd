import { EventHandler } from '@SharedKernel/Domain/Application/EventHandler';
import { Result, IResult } from '@SharedKernel/Domain/Application/Result';
import { AccountValidatedIntegrationEvent } from '@SharedKernel/Application/IntegrationEvents/AccountIntegrationEvents';
import { ExecutionContext } from '@SharedKernel/Domain/Application/ExecutionContext';
import { NotificationType } from '@Contexts/Notifications/Domain/Notification/Notification';
import { INotificationService } from '@Contexts/Notifications/Domain/Notification/Ports/INotificationService';
import { DeliveryStrategy } from '@Contexts/Notifications/Domain/Notification/DeliveryStrategy';

export class AccountValidatedIntegrationEventHandler extends EventHandler<AccountValidatedIntegrationEvent> {
  constructor(private notificationService: INotificationService) {
    super();
  }

  async execute(event: AccountValidatedIntegrationEvent, context: ExecutionContext): Promise<IResult<void>> {
    try {
      const { accountId, email } = event.payload;

      // Send a welcome email after account validation with execution context
      const notification = {
        recipientId: accountId,
        type: NotificationType.EMAIL,
        title: 'Welcome! Your Account is Now Active',
        deliveryStrategy: DeliveryStrategy.emailOnly(),
        content: `
            <p>Congratulations! Your account has been successfully verified.</p>
            <p>You now have full access to all features of our platform.</p>
            <p>Thank you for joining us!</p>
          `,
        metadata: {
          email: email,
          source: 'Security.AccountValidated',
        },
        isManual: false,
      };

      this.notificationService.send(notification, context);

      return Result.ok();
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
