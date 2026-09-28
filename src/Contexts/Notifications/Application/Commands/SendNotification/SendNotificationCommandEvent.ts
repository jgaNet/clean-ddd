import { CommandEvent } from '@SharedKernel/Domain';

import { INewNotification } from '@Contexts/Notifications/Domain/Notification/DTOs';

/** A notification sent by hand, by an administrator. Reactions to other contexts do not go through it. */
export class SendNotificationCommandEvent extends CommandEvent<INewNotification> {}
