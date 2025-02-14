import { UsersManagerModule } from '@Contexts/UsersManager/Application';

import { KafkaEventBus } from '@Shared/Infrastructure/EventBus/KafkaEventBus';
import { UserCreatedHandler } from '@Contexts/UsersManager/Application/Events/UserCreatedHandler';
import { UserCreatedEvent } from '@Contexts/UsersManager/Domain/User/Events/UserCreatedEvent';
import { CreateUserCommandEvent } from '@Contexts/UsersManager/Application/Commands/CreateUser/CreateUserCommandEvents';
import { InMemoryUserRepository } from '@Contexts/UsersManager/Infrastructure/Repositories/InMemoryUserRepository';
import { InMemoryEventBus } from '@Shared/Infrastructure/EventBus/InMemoryEventBus';
import { CreateUserCommandHandler } from '@Contexts/UsersManager/Application/Commands/CreateUser/CreateUserCommandHandler';
import { GetUsersQueryHandler } from '@Contexts/UsersManager/Application/Queries/GetUsers/GetUsersQueryHandler';
import { Config } from 'application.config';
import { InMemoryDataSource } from '@Shared/Infrastructure/DataSources/InMemoryDataSource';
import { IUser } from '@Contexts/UsersManager/Domain/User/DTOs';
import { InMemoryUserQueries } from './Infrastructure/Queries/InMemoryUserQueries';

const eventBus = Config.kafka.active
  ? new KafkaEventBus({
      clientId: Config.kafka.clientId,
      brokers: Config.kafka.brokers,
    })
  : new InMemoryEventBus();

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
