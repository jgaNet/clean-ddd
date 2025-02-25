import { EventHandler } from '@Primitives/EventHandler';
import { UserCreatedEvent } from '@Contexts/UsersManager/Domain/User/Events/UserCreatedEvent';
import { ResultValue, Result } from '@Primitives/Result';

export class UserCreatedHandler extends EventHandler<UserCreatedEvent> {
  async execute(event: UserCreatedEvent): Promise<ResultValue> {
    // eslint-disable-next-line no-console
    console.log(event.name, event.payload);

    return Result.ok();
  }
}
