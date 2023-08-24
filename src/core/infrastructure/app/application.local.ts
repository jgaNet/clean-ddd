import { Application } from '@core/application';

import { CreateUserCommandUseCase } from '@core/application/commands/CreateUserCommandUseCase';
import { KafkaBroker } from '../broker/KafkaBroker';
import { UserCreatedHandler } from '@core/application/events/UserCreatedHandler';
import { UserCreated } from '@core/domain/user/events/UserCreated';
import { InMemoryUserRepository } from '../adapters/repositories/InMemoryUserRepository';

const kafkaBroker = new KafkaBroker({
  clientId: 'my-app',
  brokers: ['localhost:9092', 'localhost:9093', 'localhost:9094'],
});

const userRepository = new InMemoryUserRepository();

export const localApplication = new Application({
  eventBus: kafkaBroker,
  commands: {
    createUser: new CreateUserCommandUseCase({
      userRepository: userRepository,
      eventBus: kafkaBroker,
    }),
  },
  queries: {},
  subscriptions: {
    domain: [{ event: UserCreated, eventHandlers: [new UserCreatedHandler()] }],
  },
});
