import { EventHandler } from '@primitives/EventHandler';
import { UserCreated } from 'core/domain/user/events/UserCreated';

export class UserCreatedHandler extends EventHandler<UserCreated> {
  async handler(event: UserCreated) {
    // eslint-disable-next-line no-console
    console.log(event, event.payload);
  }
}
