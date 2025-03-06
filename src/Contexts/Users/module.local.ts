import { CreateUserCommandEvent, CreateUserCommandHandler } from '@Contexts/Users/Application/Commands/CreateUser';

import { GetUsersQueryHandler } from '@Contexts/Users/Application/Queries/GetUsers/GetUsersQueryHandler';
import { IUser } from '@Contexts/Users/Domain/User';
import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';
import { InMemoryUserQueries } from '@Contexts/Users/Infrastructure/Queries/InMemoryUserQueries';
import { InMemoryUserRepository } from '@Contexts/Users/Infrastructure/Repositories/InMemoryUserRepository';
import { UserCreatedEvent } from '@Contexts/Users/Domain/User';
import { UserCreatedHandler } from '@Contexts/Users/Application/Events/UserCreatedHandler';
import { UsersModule } from '@Contexts/Users/Application';
import { ModuleBuilder } from '@Primitives/Module';

const inMemoryDataSource = new InMemoryDataSource<IUser>();
const userRepository = new InMemoryUserRepository(inMemoryDataSource);
const userQueries = new InMemoryUserQueries(inMemoryDataSource);
const getUsersQueryHandler = new GetUsersQueryHandler(userQueries);
const createUserCommandHandler = new CreateUserCommandHandler({ userRepository, userQueries });

export const localUsersModule = new ModuleBuilder<UsersModule>(Symbol('Users'))
  .setCommand({
    event: CreateUserCommandEvent,
    handlers: [createUserCommandHandler],
  })
  .setQuery(getUsersQueryHandler)
  .setDomainEvent({ event: UserCreatedEvent, handlers: [new UserCreatedHandler()] })
  .build();
