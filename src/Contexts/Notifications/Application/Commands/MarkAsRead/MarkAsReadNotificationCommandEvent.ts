import { CommandEvent } from '@SharedKernel/Domain';

export class MarkAsReadNotificationCommandEvent extends CommandEvent<{ notificationId: string }> {}
