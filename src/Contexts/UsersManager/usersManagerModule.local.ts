import { UsersManagerModule } from '@Contexts/UsersManager/Application';

import { KafkaEventBus } from '@Shared/Infrastructure/EventBus/KafkaEventBus';
import { UserCreatedHandler } from '@Contexts/UsersManager/Application/Events/UserCreatedHandler';
import { UserCreatedEvent } from '@Contexts/UsersManager/Domain/User/Events/UserCreatedEvent';
import { CreateUserCommandEvent } from '@Contexts/UsersManager/Application/Commands/CreateUser/CreateUserCommandEvents';
import { AsyncExceptionHandler } from '@Shared/Infrastructure/ExceptionHandler/AsyncExceptionHandler';
import { InMemoryUserRepository } from '@Contexts/UsersManager/Infrastructure/Repositories/InMemoryUserRepository';
import { InMemoryEventBus } from '@Shared/Infrastructure/EventBus/InMemoryEventBus';
import { CreateUserCommandHandler } from '@Contexts/UsersManager/Application/Commands/CreateUser/CreateUserCommandHandler';
import { GetUsersQuery } from '@Contexts/UsersManager/Application/Queries/GetUsers/GetUsersQuery';
import { Config } from 'application.config';
import { InMemoryDataSource } from '@Shared/Infrastructure/DataSources/InMemoryDataSource';
import { UserDTO } from '@Contexts/UsersManager/Domain/User/DTOs';

const eventBus = Config.kafka.active
  ? new KafkaEventBus({
      clientId: Config.kafka.clientId,
      brokers: Config.kafka.brokers,
    })
  : new InMemoryEventBus();

const inMemoryDataSource = new InMemoryDataSource<UserDTO>();

const userRepository = new InMemoryUserRepository(inMemoryDataSource);
const asyncExceptionHandler = new AsyncExceptionHandler({ eventBus });

export const localUsersManagerModule = new UsersManagerModule({
  eventBus,
  commands: [
    {
      event: CreateUserCommandEvent,
      eventHandlers: [
        new CreateUserCommandHandler({
          userRepository: userRepository,
          eventBus,
          exceptionHandler: asyncExceptionHandler,
        }),
      ],
    },
  ],
  queries: [
    {
      name: GetUsersQuery.name,
      handler: new GetUsersQuery(inMemoryDataSource),
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
