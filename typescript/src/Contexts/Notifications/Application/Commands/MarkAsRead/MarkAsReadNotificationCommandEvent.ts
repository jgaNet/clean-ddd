import { CommandEvent } from '@Architecture/Domain';

export class MarkAsReadNotificationCommandEvent extends CommandEvent<{ notificationId: string }> {}
