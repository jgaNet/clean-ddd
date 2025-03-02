import { UsersModule } from '@Contexts/Users/Application';
import { UserCreatedHandler } from '@Contexts/Users/Application/Events/UserCreatedHandler';
import { UserCreatedEvent } from '@Contexts/Users/Domain/User/Events/UserCreatedEvent';
import { MockedUserRepository } from '@Contexts/Users/Infrastructure/Repositories/MockedUserRepository';
import { MockedUserQueries } from '@Contexts/Users/Infrastructure/Queries/MockedUserQueries';
import { CreateUserCommandEvent } from '@Contexts/Users/Application/Commands/CreateUser/CreateUserCommandEvent';

import { CreateUserCommandHandler } from '@Contexts/Users/Application/Commands/CreateUser/CreateUserCommandHandler';
import { GetUsersQueryHandler } from '@Contexts/Users/Application/Queries/GetUsers/GetUsersQueryHandler';
import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';
import { IUser } from '@Contexts/Users/Domain/User/DTOs';

// export const inMemoryBroker = new InMemoryEventBus();
export const inMemoryDataSource = new InMemoryDataSource<IUser>();
export const mockedUserRepository = new MockedUserRepository(inMemoryDataSource);
export const mockedUserQueries = new MockedUserQueries(inMemoryDataSource);

export const mockedApplication = new UsersModule({
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
