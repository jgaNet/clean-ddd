import { EventHandler } from '@Primitives/EventHandler';
import { UserCreatedEvent } from '@Contexts/Users/Domain/User/Events/UserCreatedEvent';
import { IResult, Result } from '@Primitives/Result';
import { ExecutionContext } from '@Primitives/ExecutionContext';

export class UserCreatedHandler extends EventHandler<UserCreatedEvent> {
  async execute(event: UserCreatedEvent, context: ExecutionContext): Promise<IResult> {
    // eslint-disable-next-line no-console
    console.log(event.name, event.payload, context.traceId);

    return Result.ok();
  }
}
