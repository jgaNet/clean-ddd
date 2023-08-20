import { Application } from 'core/application';
import { CreateUserCommandUseCase } from 'core/application/commands/CreateUserCommandUseCase';
import { InMemoryBroker } from '../broker/InMemoryBroker';
import { UserCreatedHandler } from 'core/application/events/UserCreatedHandler';
import { UserCreated } from 'core/domain/user/events/UserCreated';
import { MockedUserRepository } from '../adapters/repositories/MockedUserRepository';

export const inMemoryBroker = new InMemoryBroker();
export const mockedUserRepository = new MockedUserRepository();

export const mockedApplication = new Application({
  eventBus: inMemoryBroker,
  commands: {
    createUser: new CreateUserCommandUseCase({
      userRepository: mockedUserRepository,
      eventBus: inMemoryBroker,
    }),
  },
  queries: {},
  subscriptions: {
    domain: [{ event: UserCreated, eventHandlers: [new UserCreatedHandler()] }],
  },
});
