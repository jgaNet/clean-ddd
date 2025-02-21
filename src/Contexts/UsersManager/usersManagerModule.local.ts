import {
  CreateUserCommandEvent,
  CreateUserCommandHandler,
} from '@Contexts/UsersManager/Application/Commands/CreateUser';

import { GetUsersQueryHandler } from '@Contexts/UsersManager/Application/Queries/GetUsers/GetUsersQueryHandler';
import { IUser } from '@Contexts/UsersManager/Domain/User';
import { InMemoryDataSource } from '@Shared/Infrastructure/DataSources/InMemoryDataSource';
import { InMemoryEventBus } from '@Shared/Infrastructure/EventBus/InMemoryEventBus';
import { InMemoryUserQueries } from './Infrastructure/Queries/InMemoryUserQueries';
import { InMemoryUserRepository } from '@Contexts/UsersManager/Infrastructure/Repositories/InMemoryUserRepository';
import { UserCreatedEvent } from '@Contexts/UsersManager/Domain/User';
import { UserCreatedHandler } from '@Contexts/UsersManager/Application/Events/UserCreatedHandler';
import { UsersManagerModule } from '@Contexts/UsersManager/Application';

const eventBus = new InMemoryEventBus();
const inMemoryDataSource = new InMemoryDataSource<IUser>();
const userRepository = new InMemoryUserRepository(inMemoryDataSource);
const userQueries = new InMemoryUserQueries(inMemoryDataSource);

export const localUsersManagerModule = new UsersManagerModule({
  eventBus,
  commands: [
    {
      event: CreateUserCommandEvent,
      eventHandlers: [
        new CreateUserCommandHandler({
          userRepository: userRepository,
          userQueries: userQueries,
          eventBus,
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
});
