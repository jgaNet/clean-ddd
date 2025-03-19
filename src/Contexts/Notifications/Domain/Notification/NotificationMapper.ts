import { Mapper } from '@SharedKernel/Domain/DDD/Mapper';
import { Notification } from './Notification';
import { INotification } from './DTOs';

export class NotificationMapper implements Mapper<Notification, INotification> {
  toJSON(notification: Notification): INotification {
    return {
      _id: notification._id.value,
      recipientId: notification.recipientId,
      type: notification.type,
      title: notification.title,
      content: notification.content,
      status: notification.status,
      createdAt: notification.createdAt,
      sentAt: notification.sentAt,
      readAt: notification.readAt,
      metadata: notification.metadata,
    };
  }

  toEntity(dto: INotification): Notification {
    const notificationResult = Notification.create({
      id: dto._id,
      recipientId: dto.recipientId,
      type: dto.type,
      title: dto.title,
      content: dto.content,
      metadata: dto.metadata,
    });

    if (notificationResult.isFailure()) {
      throw notificationResult.error;
    }

    const notification = notificationResult.data;

    // Set appropriate status
    if (dto.status === 'SENT') {
      notification.markAsSent();
    } else if (dto.status === 'FAILED') {
      notification.markAsFailed();
    } else if (dto.status === 'READ') {
      notification.markAsSent();
      notification.markAsRead();
    }

    return notification;
  }
}
