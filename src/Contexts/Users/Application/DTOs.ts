import { Event, EventHandler, CommandHandler, IResult } from '@Primitives';
import { UserCreatedEvent } from '@Contexts/Users/Domain/User';
import { CreateUserCommandEvent } from '@Contexts/Users/Application/Commands/CreateUser';
import { GetUsersQueryHandler } from '@Contexts/Users/Application/Queries/GetUsers';
import { IUser } from '@Contexts/Users/Domain/User';

export { INewUser as CreateUserCommandPort } from '@Contexts/Users/Domain/User/DTOs';
export type GetUsersQueryResult = IResult<IUser[]>;

export type Subscription<T> = { event: Event<T>; handlers: EventHandler<Event<T>>[] };
export type Subscriptions<T> = Subscription<T>[];

export type ModuleSubscriptions = {
  domain: Subscriptions<unknown>;
};

export type UsersModuleCommands = [
  { event: typeof CreateUserCommandEvent; handlers: CommandHandler<CreateUserCommandEvent>[] },
];

export type UsersModuleQueries = [{ name: typeof GetUsersQueryHandler.name; handler: GetUsersQueryHandler }];
export type UsersModuleDomainEvents = [{ event: typeof UserCreatedEvent; handlers: EventHandler<UserCreatedEvent>[] }];
export type UsersModuleIntegrationEvents = [];
export type UsersModuleServices = Record<string, unknown>;
