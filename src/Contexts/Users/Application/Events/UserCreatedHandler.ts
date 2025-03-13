import { EventHandler, IResult, Result, ExecutionContext } from '@SharedKernel/Domain/Application';
import { UserCreatedEvent } from '@Contexts/Users/Domain/User/Events/UserCreatedEvent';

export class UserCreatedHandler extends EventHandler<UserCreatedEvent> {
  async execute(event: UserCreatedEvent, context: ExecutionContext): Promise<IResult> {
    if (context.logger) {
      context.logger.debug(`User ${event.payload._id} created`);
    }
    return Result.ok();
  }
}
