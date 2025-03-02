import {
  CreateUserCommandEvent,
  CreateUserCommandHandler,
} from '@Contexts/UsersManager/Application/Commands/CreateUser';

import { GetUsersQueryHandler } from '@Contexts/UsersManager/Application/Queries/GetUsers/GetUsersQueryHandler';
import { IUser } from '@Contexts/UsersManager/Domain/User';
import { InMemoryDataSource } from '@Shared/Infrastructure/DataSources/InMemoryDataSource';
import { InMemoryUserQueries } from '@Contexts/UsersManager/Infrastructure/Queries/InMemoryUserQueries';
import { InMemoryUserRepository } from '@Contexts/UsersManager/Infrastructure/Repositories/InMemoryUserRepository';
import { UserCreatedEvent } from '@Contexts/UsersManager/Domain/User';
import { UserCreatedHandler } from '@Contexts/UsersManager/Application/Events/UserCreatedHandler';
import { UsersManagerModule } from '@Contexts/UsersManager/Application';

const inMemoryDataSource = new InMemoryDataSource<IUser>();
const userRepository = new InMemoryUserRepository(inMemoryDataSource);
const userQueries = new InMemoryUserQueries(inMemoryDataSource);

export const localUsersManagerModule = new UsersManagerModule({
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
