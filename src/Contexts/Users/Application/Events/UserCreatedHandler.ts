import { EventHandler } from '@Primitives/EventHandler';
import { UserCreatedEvent } from '@Contexts/Users/Domain/User/Events/UserCreatedEvent';
import { IResult, Result } from '@Primitives/Result';

export class UserCreatedHandler extends EventHandler<UserCreatedEvent> {
  async execute(event: UserCreatedEvent): Promise<IResult> {
    // eslint-disable-next-line no-console
    console.log(event.name, event.payload);

    return Result.ok();
  }
}
