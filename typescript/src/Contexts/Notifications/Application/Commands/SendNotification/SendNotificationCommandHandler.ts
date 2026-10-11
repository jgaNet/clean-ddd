import { IResult, NotAllowedException, Result } from '@Architecture/Domain';
import { Role } from '@SharedKernel/Domain';
import { CommandHandler, ExecutionContext } from '@Architecture/Application';

import { NotificationDelivery } from '@Contexts/Notifications/Application/Services/NotificationDelivery';
import { SendNotificationCommandEvent } from './SendNotificationCommandEvent';

export class SendNotificationCommandHandler extends CommandHandler<SendNotificationCommandEvent> {
  constructor(private delivery: NotificationDelivery) {
    super();
  }

  protected async guard(_: SendNotificationCommandEvent, { auth }: ExecutionContext): Promise<IResult<unknown>> {
    if (auth.role !== Role.ADMIN) {
      return Result.fail(
        new NotAllowedException('Notifications', 'Only administrators can send notifications by hand'),
      );
    }
    return Result.ok();
  }

  execute({ payload }: SendNotificationCommandEvent, context: ExecutionContext): Promise<IResult<string>> {
    return this.delivery.deliver(payload, context);
  }
}
