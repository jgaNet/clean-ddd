import { UsersManagerModule } from '@Contexts/UsersManager/Application';
import { UserCreatedHandler } from '@Contexts/UsersManager/Application/Events/UserCreatedHandler';
import { UserCreatedEvent } from '@Contexts/UsersManager/Domain/User/Events/UserCreatedEvent';
import { MockedUserRepository } from '@Contexts/UsersManager/Infrastructure/Repositories/MockedUserRepository';
import { MockedUserQueries } from '@Contexts/UsersManager/Infrastructure/Queries/MockedUserQueries';
import { CreateUserCommandEvent } from '@Contexts/UsersManager/Application/Commands/CreateUser/CreateUserCommandEvent';

import { CreateUserCommandHandler } from '@Contexts/UsersManager/Application/Commands/CreateUser/CreateUserCommandHandler';
import { GetUsersQueryHandler } from '@Contexts/UsersManager/Application/Queries/GetUsers/GetUsersQueryHandler';
import { InMemoryDataSource } from '@Shared/Infrastructure/DataSources/InMemoryDataSource';
import { IUser } from '@Contexts/UsersManager/Domain/User/DTOs';

// export const inMemoryBroker = new InMemoryEventBus();
export const inMemoryDataSource = new InMemoryDataSource<IUser>();
export const mockedUserRepository = new MockedUserRepository(inMemoryDataSource);
export const mockedUserQueries = new MockedUserQueries(inMemoryDataSource);

export const mockedApplication = new UsersManagerModule({
  commands: [
    {
      event: CreateUserCommandEvent,
      eventHandlers: [
        new CreateUserCommandHandler({
          userRepository: mockedUserRepository,
          userQueries: mockedUserQueries,
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
  services: {},
});
