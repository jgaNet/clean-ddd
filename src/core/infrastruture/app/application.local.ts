import { Application } from 'core/application';
import { CreateUserCommandUseCase } from 'core/application/commands/CreateUserCommandUseCase';
import { InMemoryBroker } from '../broker/InMemoryBroker';
import { UserCreatedHandler } from 'core/application/events/UserCreatedHandler';
import { UserCreated } from 'core/domain/user/events/UserCreated';
import { InMemoryUserRepository } from '../adapters/repositories/InMemoryUserRepository';

const inMemoryBroker = new InMemoryBroker();
const userRepository = new InMemoryUserRepository();

export const localApplication = new Application({
  eventBus: inMemoryBroker,
  commands: {
    createUser: new CreateUserCommandUseCase({
      userRepository: userRepository,
      eventBus: inMemoryBroker,
    }),
  },
  queries: {},
  subscriptions: {
    domain: [{ event: UserCreated, eventHandlers: [new UserCreatedHandler()] }],
  },
});
