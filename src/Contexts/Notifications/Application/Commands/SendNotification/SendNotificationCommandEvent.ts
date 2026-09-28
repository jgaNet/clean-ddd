import { CommandEvent } from '@SharedKernel/Domain/DDD/EventTypes';
import { SendNotificationDTO } from '@Contexts/Notifications/Application/DTOs';

export class SendNotificationCommandEvent extends CommandEvent<SendNotificationDTO> {}
