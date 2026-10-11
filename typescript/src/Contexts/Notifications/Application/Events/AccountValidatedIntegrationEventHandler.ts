import { IResult } from '@Architecture/Domain';
import { EventHandler, ExecutionContext } from '@Architecture/Application';
import { AccountValidatedIntegrationEvent } from '@SharedKernel/Application/IntegrationEvents/AccountIntegrationEvents';

import { Channel } from '@Contexts/Notifications/Domain/Notification/Channel';
import { NotificationDelivery } from '@Contexts/Notifications/Application/Services/NotificationDelivery';

/** Anti-corruption layer towards Security: a validated account is welcomed by email. */
export class AccountValidatedIntegrationEventHandler extends EventHandler<AccountValidatedIntegrationEvent> {
  constructor(private delivery: NotificationDelivery) {
    super();
  }

  execute({ payload }: AccountValidatedIntegrationEvent, context: ExecutionContext): Promise<IResult<string>> {
    return this.delivery.deliver(
      {
        recipientId: payload.accountId,
        title: 'Welcome! Your account is now active',
        content: `
          <p>Your account has been verified. You now have full access to the platform.</p>
          <p>Thank you for joining us!</p>
        `,
        channels: [Channel.EMAIL],
        metadata: { email: payload.email, source: 'Security.AccountValidated' },
      },
      context,
    );
  }
}
