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

import { ModuleBuilder } from '@Primitives/Application';

export const inMemoryDataSource = new InMemoryDataSource<IUser>();
export const mockedUserRepository = new MockedUserRepository(inMemoryDataSource);
export const mockedUserQueries = new MockedUserQueries(inMemoryDataSource);

const createUserCommandHandler = new CreateUserCommandHandler({
  userRepository: mockedUserRepository,
  userQueries: mockedUserQueries,
});

const getUsersQueryHandler = new GetUsersQueryHandler(mockedUserQueries);

const userModuleName = Symbol('users');
export const mockUsersModule = new ModuleBuilder<UsersModule>(userModuleName)
  .setCommand({
    event: CreateUserCommandEvent,
    handlers: [createUserCommandHandler],
  })
  .setQuery(getUsersQueryHandler)
  .setDomainEvent({ event: UserCreatedEvent, handlers: [new UserCreatedHandler()] })
  .build();
