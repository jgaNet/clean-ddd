import { CommandEvent } from '@SharedKernel/Domain/Application/EventTypes';
import { SendNotificationDTO } from '@Contexts/Notifications/Application/DTOs';

export class SendNotificationCommandEvent extends CommandEvent<SendNotificationDTO> {}
