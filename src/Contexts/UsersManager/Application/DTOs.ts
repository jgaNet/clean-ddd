import { Event } from '@Primitives/Event';
import { EventHandler } from '@Primitives/EventHandler';
import { UserCreatedEvent } from '@Contexts/UsersManager/Domain/User/Events/UserCreatedEvent';
import { CreateUserCommandEvent } from '@Contexts/UsersManager/Application/Commands/CreateUser/CreateUserCommandEvents';
import { GetUsersQuery } from '@Contexts/UsersManager/Application/Queries/GetUsers/GetUsersQuery';
import { CommandHandler } from '@Primitives/CommandHandler';
import { IUser } from '@Contexts/UsersManager/Domain/User/DTOs';
import Result from '@Primitives/Result';

export { INewUser as CreateUserCommandPort } from '@Contexts/UsersManager/Domain/User/DTOs';
export type GetUsersQueryResult = Result<IUser[]>;

export type Subscription<T> = { event: Event<T>; eventHandlers: EventHandler<Event<T>>[] };
export type Subscriptions<T> = Subscription<T>[];

export type ModuleSubscriptions = {
  domain: Subscriptions<unknown>;
};

export type UsersManagerModuleCommands = [
  { event: typeof CreateUserCommandEvent; eventHandlers: CommandHandler<CreateUserCommandEvent>[] },
];

export type UsersManagerModuleQueries = [{ name: typeof GetUsersQuery.name; handler: GetUsersQuery }];

export type UsersManagerModuleDomainEvents = [
  { event: typeof UserCreatedEvent; eventHandlers: EventHandler<UserCreatedEvent>[] },
];

export type UsersManagerModuleIntegrationEvents = [];
