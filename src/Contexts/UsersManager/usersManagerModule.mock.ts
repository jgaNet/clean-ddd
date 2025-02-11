import { UsersManagerModule } from '@Contexts/UsersManager/Application';
import { InMemoryEventBus } from '@Shared/Infrastructure/EventBus/InMemoryEventBus';
import { UserCreatedHandler } from '@Contexts/UsersManager/Application/Events/UserCreatedHandler';
import { UserCreatedEvent } from '@Contexts/UsersManager/Domain/User/Events/UserCreatedEvent';
import { MockedUserRepository } from '@Contexts/UsersManager/Infrastructure/Repositories/MockedUserRepository';
import { CreateUserCommandEvent } from '@Contexts/UsersManager/Application/Commands/CreateUser/CreateUserCommandEvents';
import { ThrowExceptionHandler } from '@Shared/Infrastructure/ExceptionHandler/ThrowExceptionHandler';

import { CreateUserCommandHandler } from '@Contexts/UsersManager/Application/Commands/CreateUser/CreateUserCommandHandler';
import { GetUsersQuery } from '@Contexts/UsersManager/Application/Queries/GetUsers/GetUsersQuery';
import { InMemoryDataSource } from '@Shared/Infrastructure/DataSources/InMemoryDataSource';
import { IUser } from '@Contexts/UsersManager/Domain/User/DTOs';
import { InMemoryUserQueries } from './Infrastructure/Queries/InMemoryUserQueries';

export const inMemoryDataSource = new InMemoryDataSource<IUser>();
export const inMemoryBroker = new InMemoryEventBus();
export const mockedUserRepository = new MockedUserRepository(inMemoryDataSource);
export const inMemoryUserQueries = new InMemoryUserQueries(inMemoryDataSource);
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
  queries: [
    {
      name: GetUsersQuery.name,
      handler: new GetUsersQuery(inMemoryUserQueries),
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
