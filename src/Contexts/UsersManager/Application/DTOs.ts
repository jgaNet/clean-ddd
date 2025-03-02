import { Event, EventHandler, CommandHandler, IResult } from '@Primitives';
import { UserCreatedEvent } from '@Contexts/UsersManager/Domain/User';
import { CreateUserCommandEvent } from '@Contexts/UsersManager/Application/Commands/CreateUser';
import { GetUsersQueryHandler } from '@Contexts/UsersManager/Application/Queries/GetUsers';
import { IUser } from '@Contexts/UsersManager/Domain/User';

export { INewUser as CreateUserCommandPort } from '@Contexts/UsersManager/Domain/User/DTOs';
export type GetUsersQueryResult = IResult<IUser[]>;

export type Subscription<T> = { event: Event<T>; eventHandlers: EventHandler<Event<T>>[] };
export type Subscriptions<T> = Subscription<T>[];

export type ModuleSubscriptions = {
  domain: Subscriptions<unknown>;
};

export type UsersManagerModuleCommands = [
  { event: typeof CreateUserCommandEvent; eventHandlers: CommandHandler<CreateUserCommandEvent>[] },
];

export type UsersManagerModuleQueries = [{ name: typeof GetUsersQueryHandler.name; handler: GetUsersQueryHandler }];

export type UsersManagerModuleDomainEvents = [
  { event: typeof UserCreatedEvent; eventHandlers: EventHandler<UserCreatedEvent>[] },
];

export type UsersManagerModuleIntegrationEvents = [];

export type UsersManagerModuleServices = Record<string, unknown>;
