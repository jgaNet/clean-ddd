import { EventHandler } from '@Primitives/EventHandler';
import { UserCreatedEvent } from '@Contexts/UsersManager/Domain/User/Events/UserCreatedEvent';

export class UserCreatedHandler extends EventHandler<UserCreatedEvent> {
  async execute(event: UserCreatedEvent) {
    // eslint-disable-next-line no-console
    console.log(event, event.payload);
  }
}
