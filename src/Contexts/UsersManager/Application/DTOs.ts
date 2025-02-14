import { Event } from '@Primitives/Event';
import { EventHandler } from '@Primitives/EventHandler';
import { UserCreatedEvent } from '@Contexts/UsersManager/Domain/User/Events/UserCreatedEvent';
import { CreateUserCommandEvent } from '@Contexts/UsersManager/Application/Commands/CreateUser/CreateUserCommandEvents';
import { GetUsersQueryHandler } from '@Contexts/UsersManager/Application/Queries/GetUsers/GetUsersQueryHandler';
import { CommandHandler } from '@Primitives/CommandHandler';
import { IUser } from '@Contexts/UsersManager/Domain/User/DTOs';
import { ResultValue } from '@Primitives/Result';

export { INewUser as CreateUserCommandPort } from '@Contexts/UsersManager/Domain/User/DTOs';
export type GetUsersQueryResult = ResultValue<IUser[]>;

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
