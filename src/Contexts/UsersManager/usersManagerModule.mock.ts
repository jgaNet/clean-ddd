import { UsersManagerModule } from '@Contexts/UsersManager/Application';
import { InMemoryEventBus } from '@Shared/Infrastructure/EventBus/InMemoryEventBus';
import { UserCreatedHandler } from '@Contexts/UsersManager/Application/Events/UserCreatedHandler';
import { UserCreatedEvent } from '@Contexts/UsersManager/Domain/User/Events/UserCreatedEvent';
import { MockedUserRepository } from '@Contexts/UsersManager/Infrastructure/Repositories/MockedUserRepository';
import { MockedUserQueries } from '@Contexts/UsersManager/Infrastructure/Queries/MockedUserQueries';
import { CreateUserCommandEvent } from '@Contexts/UsersManager/Application/Commands/CreateUser/CreateUserCommandEvents';
import { ThrowExceptionHandler } from '@Shared/Infrastructure/ExceptionHandler/ThrowExceptionHandler';

import { CreateUserCommandHandler } from '@Contexts/UsersManager/Application/Commands/CreateUser/CreateUserCommandHandler';
import { GetUsersQueryHandler } from '@Contexts/UsersManager/Application/Queries/GetUsers/GetUsersQueryHandler';
import { InMemoryDataSource } from '@Shared/Infrastructure/DataSources/InMemoryDataSource';
import { IUser } from '@Contexts/UsersManager/Domain/User/DTOs';

export const inMemoryDataSource = new InMemoryDataSource<IUser>();
export const inMemoryBroker = new InMemoryEventBus();
export const mockedUserRepository = new MockedUserRepository(inMemoryDataSource);

export const mockedUserQueries = new MockedUserQueries(inMemoryDataSource);

export const exceptionHandler = new ThrowExceptionHandler();

export const mockedApplication = new UsersManagerModule({
  eventBus: inMemoryBroker,
  commands: [
    {
      event: CreateUserCommandEvent,
      eventHandlers: [
        new CreateUserCommandHandler({
          userRepository: mockedUserRepository,
          userQueries: mockedUserQueries,
          eventBus: inMemoryBroker,
        }),
      ],
    },
  ],
  queries: [
    {
      name: GetUsersQueryHandler.name,
      handler: new GetUsersQueryHandler(mockedUserQueries),
    },
  ],
  domainEvents: [
    {
      event: UserCreatedEvent,
      eventHandlers: [new UserCreatedHandler()],
    },
  ],
  integrationEvents: [],
});
