import { IResult, NotAllowedException, Result } from '@Architecture/Domain';
import { Role } from '@SharedKernel/Domain';
import { ExecutionContext, QueryHandler } from '@Architecture/Application';
import { requireSignedIn } from '@SharedKernel/Application/Guards';

import {
  InboxFilters,
  INotificationQueries,
  NotificationListItem,
} from '@Contexts/Notifications/Domain/Notification/Ports/INotificationQueries';

export type InboxQuery = InboxFilters & { recipientId: string };

export interface Inbox {
  notifications: NotificationListItem[];
  total: number;
  unread: number;
}

/** An account reads its own inbox; an administrator may read anyone's. */
export class GetNotificationsQueryHandler extends QueryHandler<INotificationQueries, InboxQuery, IResult<Inbox>> {
  protected async guard({ recipientId }: InboxQuery, context: ExecutionContext): Promise<IResult<unknown>> {
    const reader = requireSignedIn(context, 'Notifications');
    if (reader.isFailure()) return reader;

    if (context.auth.role !== Role.ADMIN && reader.data.value !== recipientId) {
      return Result.fail(
        new NotAllowedException('Notifications', 'Only the recipient or an administrator can read an inbox'),
      );
    }
    return Result.ok();
  }

  async execute({ recipientId, ...filters }: InboxQuery): Promise<IResult<Inbox>> {
    const [notifications, total, unread] = await Promise.all([
      this.queries.findByRecipient(recipientId, filters),
      this.queries.countByRecipient(recipientId),
      this.queries.countByRecipient(recipientId, true),
    ]);

    return Result.ok({ notifications, total, unread });
  }
}
