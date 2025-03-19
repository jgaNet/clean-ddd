import { CommandHandler } from '@SharedKernel/Domain/Application/CommandHandler';
import { Result, IResult } from '@SharedKernel/Domain/Application/Result';
import { ExecutionContext } from '@SharedKernel/Domain/Application/ExecutionContext';
import { Role } from '@SharedKernel/Domain/AccessControl/Role';
import { MarkAsReadNotificationCommandEvent } from './MarkAsReadNotificationCommandEvent';
import { INotificationRepository } from '@Contexts/Notifications/Domain/Notification/Ports/INotificationRepository';
import { INotificationQueries } from '@Contexts/Notifications/Domain/Notification/Ports/INotificationQueries';
import { NotAllowedException } from '@SharedKernel/Domain/Application/CommonExceptions';

export class MarkAsReadNotificationCommandHandler extends CommandHandler<MarkAsReadNotificationCommandEvent> {
  constructor(
    private notificationRepository: INotificationRepository,
    private notificationQueries: INotificationQueries,
  ) {
    super();
  }
  async execute(
    { payload: notificationId }: MarkAsReadNotificationCommandEvent,
    context: ExecutionContext,
  ): Promise<IResult<boolean>> {
    try {
      context.logger?.info(`Marking notification ${notificationId} as read`);

      const success = await this.notificationRepository.markAsRead(notificationId);

      if (!success) {
        context.logger?.error(`Failed to mark notification ${notificationId} as read`, { traceId: context.traceId });
        return Result.fail(new Error(`Failed to mark notification as read`));
      }

      return Result.ok(true);
    } catch (error) {
      context.logger?.error(`Error marking notification as read: ${(error as Error).message}`, {
        traceId: context.traceId,
      });
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
  protected async guard(
    { payload: notificationId }: MarkAsReadNotificationCommandEvent,
    { auth }: ExecutionContext,
  ): Promise<IResult> {
    // Get the notification to check ownership
    const notification = await this.notificationQueries.findById(notificationId);

    if (!notification) {
      return Result.fail(new Error(`Notification with ID ${notificationId} not found`));
    }

    // Check if the user is the recipient or an admin
    const isRecipient = notification.recipientId === auth.subjectId;
    const isAdmin = auth.role === Role.ADMIN;

    if (!isRecipient && !isAdmin) {
      return Result.fail(
        new NotAllowedException(
          'Notifications',
          'Only the notification recipient or an administrator can mark it as read',
        ),
      );
    }

    return Result.ok();
  }
}
