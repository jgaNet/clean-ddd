import { EventHandler } from '@SharedKernel/Domain/Application/EventHandler';
import { Result, IResult } from '@SharedKernel/Domain/Application/Result';
import { AccountValidatedIntegrationEvent } from '@SharedKernel/Application/IntegrationEvents/AccountIntegrationEvents';
import { ExecutionContext } from '@SharedKernel/Domain/Application/ExecutionContext';
import { SendNotificationCommandEvent } from '../Commands/SendNotification/SendNotificationCommandEvent';
import { NotificationType } from '@Contexts/Notifications/Domain/Notification/Notification';

export class AccountValidatedIntegrationEventHandler extends EventHandler<AccountValidatedIntegrationEvent> {
  async execute(event: AccountValidatedIntegrationEvent, context: ExecutionContext): Promise<IResult<void>> {
    try {
      const { accountId, email } = event.payload;

      // Send a welcome email after account validation with execution context
      const commandEvent = SendNotificationCommandEvent.set({
        recipientId: accountId,
        type: NotificationType.EMAIL,
        title: 'Welcome! Your Account is Now Active',
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
      });

      context.eventBus.publish(commandEvent, context);

      return Result.ok();
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
