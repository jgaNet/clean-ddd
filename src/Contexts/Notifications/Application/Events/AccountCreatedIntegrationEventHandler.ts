import { EventHandler } from '@SharedKernel/Domain/Application/EventHandler';
import { Result, IResult } from '@SharedKernel/Domain/Application/Result';
import { AccountCreatedIntegrationEvent } from '@SharedKernel/Application/IntegrationEvents/AccountIntegrationEvents';
import { ExecutionContext } from '@SharedKernel/Domain/Application/ExecutionContext';
import { SendNotificationCommandEvent } from '../Commands/SendNotification/SendNotificationCommandEvent';
import { NotificationType } from '@Contexts/Notifications/Domain/Notification/Notification';

export class AccountCreatedIntegrationEventHandler extends EventHandler<AccountCreatedIntegrationEvent> {
  constructor(private readonly url: string) {
    super();
  }
  async execute(event: AccountCreatedIntegrationEvent, context: ExecutionContext): Promise<IResult<void>> {
    try {
      const { accountId, email, validationToken } = event.payload;

      // Create a verification email notification with execution context
      const commandEvent = SendNotificationCommandEvent.set({
        recipientId: accountId,
        type: NotificationType.EMAIL,
        title: 'Welcome to Our Platform - Verify Your Account',
        content: `
            <p>Thank you for creating an account!</p>
            <p>Please verify your account by clicking on the link below:</p>
            <p><a href="${this.url}/auth/validate?validation_token=${validationToken}">Verify Your Account</a></p>
            <p>This link will expire in 24 hours.</p>
          `,
        metadata: {
          email: email,
          token: validationToken,
          source: 'Security.AccountCreated',
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
