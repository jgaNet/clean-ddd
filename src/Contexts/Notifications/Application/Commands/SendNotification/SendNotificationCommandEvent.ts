import { CommandEvent } from '@Core/Application/EventTypes';
import { SendNotificationDTO } from '@Contexts/Notifications/Application/DTOs';

export class SendNotificationCommandEvent extends CommandEvent<SendNotificationDTO> {}
