import { UsersManagerModule } from 'users-manager/application';
import { InMemoryEventBus } from 'users-manager/infrastructure/eventBus/InMemoryEventBus';
import { UserCreatedHandler } from 'users-manager/application/events/UserCreatedHandler';
import { UserCreatedEvent } from 'users-manager/domain/user/events/UserCreatedEvent';
import { MockedUserRepository } from 'users-manager/infrastructure/adapters/repositories/MockedUserRepository';
import { CreateUserCommandEvent } from 'users-manager/application/commands/CreateUser/CreateUserCommandEvents';
import { ThrowExceptionHandler } from 'users-manager/infrastructure/exceptionHandler/ThrowExceptionHandler';

import { CreateUserCommandHandler } from 'users-manager/application/commands/CreateUser/CreateUserCommandHandler';
import { GetUsersQuery } from 'users-manager/application/queries/GetUsers/GetUsersQuery';

export const inMemoryBroker = new InMemoryEventBus();
export const mockedUserRepository = new MockedUserRepository();
export const exceptionHandler = new ThrowExceptionHandler();

export const mockedApplication = new UsersManagerModule({
  eventBus: inMemoryBroker,
  commands: [
    {
      event: CreateUserCommandEvent,
      eventHandlers: [
        new CreateUserCommandHandler({
          userRepository: mockedUserRepository,
          eventBus: inMemoryBroker,
          exceptionHandler,
        }),
      ],
    },
  ],
  queries: {
    getUsers: new GetUsersQuery(),
  },
  domainEvents: [{ event: UserCreatedEvent, eventHandlers: [new UserCreatedHandler()] }],
});
