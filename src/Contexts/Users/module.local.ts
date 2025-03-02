import { CreateUserCommandEvent, CreateUserCommandHandler } from '@Contexts/Users/Application/Commands/CreateUser';

import { GetUsersQueryHandler } from '@Contexts/Users/Application/Queries/GetUsers/GetUsersQueryHandler';
import { IUser } from '@Contexts/Users/Domain/User';
import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';
import { InMemoryUserQueries } from '@Contexts/Users/Infrastructure/Queries/InMemoryUserQueries';
import { InMemoryUserRepository } from '@Contexts/Users/Infrastructure/Repositories/InMemoryUserRepository';
import { UserCreatedEvent } from '@Contexts/Users/Domain/User';
import { UserCreatedHandler } from '@Contexts/Users/Application/Events/UserCreatedHandler';
import { UsersModule } from '@Contexts/Users/Application';

const inMemoryDataSource = new InMemoryDataSource<IUser>();
const userRepository = new InMemoryUserRepository(inMemoryDataSource);
const userQueries = new InMemoryUserQueries(inMemoryDataSource);

export const localUsersModule = new UsersModule({
  commands: [
    {
      event: CreateUserCommandEvent,
      eventHandlers: [
        new CreateUserCommandHandler({
          userRepository: userRepository,
          userQueries: userQueries,
        }),
      ],
    },
  ],
  queries: [
    {
      name: GetUsersQueryHandler.name,
      handler: new GetUsersQueryHandler(userQueries),
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
