import { Event } from '@primitives/Event';
import { EventHandler } from '@primitives/EventHandler';
import { UserCreatedEvent } from '@users-manager/domain/user/events/UserCreatedEvent';
import { CreateUserCommandEvent } from './commands/CreateUser/CreateUserCommandEvents';
import { GetUsersQuery } from './queries/GetUsers/GetUsersQuery';

export { NewUserDTO as CreateUserCommandPort } from '@users-manager/domain/user/dtos';

export type Subscription<T> = { event: Event<T>; eventHandlers: EventHandler<Event<T>>[] };
export type Subscriptions<T> = Subscription<T>[];

export type ModuleSubscriptions = {
  domain: Subscriptions<unknown>;
};

export type UsersManagerModuleCommands = [
  { event: typeof CreateUserCommandEvent; eventHandlers: EventHandler<CreateUserCommandEvent>[] },
];

export type UsersManagerModuleQueries = [{ name: 'getUsers'; handler: GetUsersQuery }];

export type UsersManagerModuleDomainEvents = [
  { event: typeof UserCreatedEvent; eventHandlers: EventHandler<UserCreatedEvent>[] },
];

export type UsersManagerModuleIntegrationEvents = [];
