import { UsersManagerModule } from '@users-manager/application';

import { KafkaEventBus } from '@users-manager/infrastructure/event-bus/KafkaEventBus';
import { UserCreatedHandler } from '@users-manager/application/events/UserCreatedHandler';
import { UserCreatedEvent } from '@users-manager/domain/user/events/UserCreatedEvent';
import { CreateUserCommandEvent } from '@users-manager/application/commands/CreateUser/CreateUserCommandEvents';
import { AsyncExceptionHandler } from '@users-manager/infrastructure/exception-handler/AsyncExceptionHandler';
import { InMemoryUserRepository } from '@users-manager/infrastructure/adapters/repositories/InMemoryUserRepository';
import { InMemoryEventBus } from '@users-manager/infrastructure/event-bus/InMemoryEventBus';
import { CreateUserCommandHandler } from '@users-manager/application/commands/CreateUser/CreateUserCommandHandler';
import { GetUsersQuery } from '@users-manager/application/queries/GetUsers/GetUsersQuery';
import { Config } from 'application.config';
import { inMemoryDataSource } from './infrastructure/data-sources/InMemoryDataSource';

const eventBus = Config.kafka.active
  ? new KafkaEventBus({
      clientId: Config.kafka.clientId,
      brokers: Config.kafka.brokers,
    })
  : new InMemoryEventBus();

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
  queries: [{ name: 'getUsers', handler: new GetUsersQuery() }],
  domainEvents: [{ event: UserCreatedEvent, eventHandlers: [new UserCreatedHandler()] }],
  integrationEvents: [],
});
