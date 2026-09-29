import { IResult } from '@SharedKernel/Domain';
import { EventHandler, ExecutionContext } from '@SharedKernel/Application';
import { AccountCreatedIntegrationEvent } from '@SharedKernel/Application/IntegrationEvents/AccountIntegrationEvents';

import { Channel } from '@Contexts/Notifications/Domain/Notification/Channel';
import { NotificationDelivery } from '@Contexts/Notifications/Application/Services/NotificationDelivery';

/** Anti-corruption layer towards Security: a new account gets its validation link by email. */
export class AccountCreatedIntegrationEventHandler extends EventHandler<AccountCreatedIntegrationEvent> {
  constructor(
    private readonly url: string,
    private delivery: NotificationDelivery,
  ) {
    super();
  }

  execute({ payload }: AccountCreatedIntegrationEvent, context: ExecutionContext): Promise<IResult<string>> {
    const { accountId, email, validationToken } = payload;

    return this.delivery.deliver(
      {
        recipientId: accountId,
        title: 'Welcome - verify your account',
        content: `
          <p>Thank you for creating an account!</p>
          <p>Please verify it by clicking on the link below:</p>
          <p><a href="${this.url}/auth/validate?validation_token=${validationToken}">Verify your account</a></p>
          <p>This link will expire in 24 hours.</p>
        `,
        channels: [Channel.EMAIL],
        metadata: { email, source: 'Security.AccountCreated' },
      },
      context,
    );
  }
}
