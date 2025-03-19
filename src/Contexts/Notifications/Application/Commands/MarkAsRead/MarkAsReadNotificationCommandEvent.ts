import { CommandEvent } from '@SharedKernel/Domain/Application/EventTypes';

export class MarkAsReadNotificationCommandEvent extends CommandEvent<string> {}