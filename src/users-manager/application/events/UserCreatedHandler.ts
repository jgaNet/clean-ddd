import { EventHandler } from '@primitives/EventHandler';
import { UserCreatedEvent } from 'users-manager/domain/user/events/UserCreatedEvent';

export class UserCreatedHandler extends EventHandler<UserCreatedEvent> {
  async execute(event: UserCreatedEvent) {
    // eslint-disable-next-line no-console
    console.log(event, event.payload);
  }
}
