import { IResult, Result } from '@SharedKernel/Domain';
import { ExecutionContext, publishDomainEvents } from '@SharedKernel/Application';

import { Notification } from '@Contexts/Notifications/Domain/Notification/Notification';
import { INewNotification } from '@Contexts/Notifications/Domain/Notification/DTOs';
import { INotificationChannel } from '@Contexts/Notifications/Domain/Notification/Ports/INotificationChannel';
import { INotificationRepository } from '@Contexts/Notifications/Domain/Notification/Ports/INotificationRepository';

/**
 * The one use case every entry point of this context ends in: create the notification,
 * try its channels in order until one accepts it, keep the story. An application service
 * because it orchestrates ports and publishes events; it holds no rule of its own (the
 * aggregate decides which channel is next and when it is sent or failed).
 *
 * Called by the SendNotification command (manual, administrators) and by the
 * anti-corruption handlers reacting to other contexts.
 */
export class NotificationDelivery {
  #channels: Map<string, INotificationChannel>;

  constructor(
    private notifications: INotificationRepository,
    channels: INotificationChannel[],
  ) {
    this.#channels = new Map(channels.map(channel => [channel.channel, channel]));
  }

  async deliver(props: INewNotification, context: ExecutionContext): Promise<IResult<string>> {
    const created = Notification.create(props);
    if (created.isFailure()) return created;
    const notification = created.data;

    const delivery = {
      notificationId: notification._id.value,
      recipientId: notification.recipientId.value,
      title: notification.title,
      content: notification.content,
      metadata: notification.metadata,
    };

    for (const channel of notification.channelsToTry()) {
      const adapter = this.#channels.get(channel);
      const available = adapter ? await adapter.isAvailableFor(delivery.recipientId) : false;
      const outcome = adapter && available ? await adapter.deliver(delivery) : Result.fail(`${channel} unavailable`);

      if (outcome.isFailure()) {
        context.logger?.debug(`Notification ${delivery.notificationId}: ${channel} failed (${outcome.error.message})`, {
          traceId: context.traceId,
        });
      }

      notification.recordAttempt(channel, outcome.isSuccess());
      if (outcome.isSuccess()) break;
    }

    await this.notifications.save(notification);
    publishDomainEvents(notification, context);

    return Result.ok(notification._id.value);
  }
}
