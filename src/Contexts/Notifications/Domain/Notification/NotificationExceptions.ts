import { Exception } from '@SharedKernel/Domain';

export class NotificationDomainException extends Exception {
  constructor({ type, message, context }: { type: string; message: string; context?: unknown }) {
    super({ service: 'Notifications', type, message, context });
  }
}

export class BlankNotificationTitleException extends NotificationDomainException {
  constructor() {
    super({ type: 'BlankNotificationTitle', message: 'A notification needs a title' });
  }
}

export class BlankNotificationContentException extends NotificationDomainException {
  constructor() {
    super({ type: 'BlankNotificationContent', message: 'A notification needs a content' });
  }
}

export class EmptyDeliveryStrategyException extends NotificationDomainException {
  constructor() {
    super({ type: 'EmptyDeliveryStrategy', message: 'A notification needs at least one channel' });
  }
}

export class NotificationNotFoundException extends NotificationDomainException {
  constructor(notificationId: string) {
    super({ type: 'NotificationNotFound', message: 'Notification not found', context: { notificationId } });
  }
}

export class NotNotificationRecipientException extends NotificationDomainException {
  constructor(notificationId: string, actorId: string) {
    super({
      type: 'NotNotificationRecipient',
      message: 'Only the recipient of a notification can read it',
      context: { notificationId, actorId },
    });
  }
}

export class NotificationNotDeliveredException extends NotificationDomainException {
  constructor(notificationId: string) {
    super({
      type: 'NotificationNotDelivered',
      message: 'A notification can only be read once it was delivered',
      context: { notificationId },
    });
  }
}

export class NotificationAlreadyReadException extends NotificationDomainException {
  constructor(notificationId: string) {
    super({
      type: 'NotificationAlreadyRead',
      message: 'This notification was already read',
      context: { notificationId },
    });
  }
}

export class ChannelAlreadyTriedException extends NotificationDomainException {
  constructor(notificationId: string, channel: string) {
    super({
      type: 'ChannelAlreadyTried',
      message: 'This channel was already tried for this notification',
      context: { notificationId, channel },
    });
  }
}
