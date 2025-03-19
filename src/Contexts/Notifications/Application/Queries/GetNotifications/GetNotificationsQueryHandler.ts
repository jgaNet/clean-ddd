import { QueryHandler } from '@SharedKernel/Domain/Application/QueryHandler';
import { Result, IResult } from '@SharedKernel/Domain/Application/Result';
import { INotificationQueries } from '@Contexts/Notifications/Domain/Notification/Ports/INotificationQueries';
import { GetNotificationsDTO, NotificationListResponseDTO } from '../../DTOs';
import { ExecutionContext } from '@SharedKernel/Domain/Application/ExecutionContext';
import { Role } from '@SharedKernel/Domain';

export class GetNotificationsQueryHandler extends QueryHandler<
  INotificationQueries,
  GetNotificationsDTO,
  IResult<NotificationListResponseDTO>
> {
  constructor(private notificationQueries: INotificationQueries) {
    super(notificationQueries);
  }

  protected async guard(params: GetNotificationsDTO, context: ExecutionContext): Promise<IResult> {
    if (!params.recipientId) {
      return Result.fail(new Error('Recipient ID is required'));
    }

    if (!context.auth) {
      return Result.fail(new Error('Authentication is required'));
    }

    if (context.auth.role === Role.ADMIN) {
      return Result.ok();
    }

    if (context.auth.role === Role.USER && params.recipientId !== context.auth.subjectId) {
      return Result.fail(new Error('Only the recipient or an administrator can get notifications'));
    }

    if (context.auth.role === Role.GUEST) {
      return Result.fail(new Error('Only the recipient or an administrator can get notifications'));
    }

    return Result.ok();
  }

  async execute(params: GetNotificationsDTO, __?: ExecutionContext): Promise<IResult<NotificationListResponseDTO>> {
    try {
      const { recipientId, limit = 10, offset = 0, onlyUnread = false } = params || {};

      // Get notifications
      const notifications = await this.notificationQueries.findAll({
        recipientId,
        limit,
        offset,
        onlyUnread,
      });

      // Count total and unread
      const total = await this.notificationQueries.count(recipientId);
      const unread = await this.notificationQueries.count(recipientId, true);

      // Map to DTOs with formatted dates
      const notificationDTOs = notifications.map(notification => ({
        id: notification._id,
        recipientId: notification.recipientId,
        type: notification.type,
        title: notification.title,
        content: notification.content,
        status: notification.status,
        createdAt: notification.createdAt.toISOString(),
        sentAt: notification.sentAt ? notification.sentAt.toISOString() : null,
        readAt: notification.readAt ? notification.readAt.toISOString() : null,
        metadata: notification.metadata,
      }));

      return Result.ok({
        notifications: notificationDTOs,
        total,
        unread,
      });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
