// import { EventHandler, IEventsBroker } from 'infrastructure/bin/broker';
import { UserCreatedEvent } from 'core/domain/user/events/UserCreatedEvent';

export class OnShortUrlCreated {
  constructor() { }
  async handler(event: UserCreatedEvent) { }
}
