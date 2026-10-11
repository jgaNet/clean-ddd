import { IResult, Result } from '@Architecture/Domain';
import { Logger } from '@Architecture/Application';

import { Channel } from '@Contexts/Notifications/Domain/Notification/Channel';
import { Delivery, INotificationChannel } from '@Contexts/Notifications/Domain/Notification/Ports/INotificationChannel';

export interface EmailConfig {
  fromEmail: string;
}

/**
 * Email delivery. This reference project has no mail server: the adapter logs what it
 * would send. A real one would hand the same Delivery to an SMTP client or a provider API,
 * and nothing above this file would change.
 */
export class EmailChannel implements INotificationChannel {
  readonly channel = Channel.EMAIL;

  constructor(
    private logger: Logger,
    private config: EmailConfig,
  ) {}

  async isAvailableFor(): Promise<boolean> {
    return true;
  }

  async deliver(delivery: Delivery): Promise<IResult> {
    const to = delivery.metadata.email;
    if (typeof to !== 'string' || !to) {
      return Result.fail(new Error(`No email address for recipient ${delivery.recipientId}`));
    }

    this.logger.info(`[EMAIL] from ${this.config.fromEmail} to ${to}: ${delivery.title}`);
    this.logger.debug(delivery.content);
    return Result.ok();
  }
}
