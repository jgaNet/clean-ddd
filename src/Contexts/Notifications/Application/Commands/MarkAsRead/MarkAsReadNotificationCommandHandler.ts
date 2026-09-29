import { IResult, Result } from '@Architecture/Domain';
import { CommandHandler, ExecutionContext } from '@Architecture/Application';
import { requireSignedIn } from '@SharedKernel/Application/Guards';

import { INotificationRepository } from '@Contexts/Notifications/Domain/Notification/Ports/INotificationRepository';
import { NotificationNotFoundException } from '@Contexts/Notifications/Domain/Notification/NotificationExceptions';
import { MarkAsReadNotificationCommandEvent } from './MarkAsReadNotificationCommandEvent';

export class MarkAsReadNotificationCommandHandler extends CommandHandler<MarkAsReadNotificationCommandEvent> {
  constructor(private notifications: INotificationRepository) {
    super();
  }

  async execute({ payload }: MarkAsReadNotificationCommandEvent, context: ExecutionContext): Promise<IResult> {
    const reader = requireSignedIn(context, 'Notifications');
    if (reader.isFailure()) return reader;

    const notification = await this.notifications.findById(payload.notificationId);
    if (!notification) return Result.fail(new NotificationNotFoundException(payload.notificationId));

    const read = notification.markRead(reader.data);
    if (read.isFailure()) return read;

    await this.notifications.save(notification);
    this.publishDomainEvents(notification, context);

    return Result.ok();
  }
}
