import { DomainEvent } from '@SharedKernel/Domain';

import { Channel } from '@Contexts/Notifications/Domain/Notification/Channel';

export class NotificationSentEvent extends DomainEvent<{ notificationId: string; recipientId: string; via: Channel }> {}

export class NotificationFailedEvent extends DomainEvent<{ notificationId: string; recipientId: string }> {}

export class NotificationReadEvent extends DomainEvent<{ notificationId: string; recipientId: string }> {}
