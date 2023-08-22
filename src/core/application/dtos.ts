import { CreateUserCommandUseCase } from './commands/CreateUserCommandUseCase';
import { Event } from '@primitives/Event';
import { EventHandler } from '@primitives/EventHandler';
import { UserCreated } from '@core/domain/user/events/UserCreated';

export { NewUserDTO as CreateUserCommandInput } from '@core/domain/user/dtos';

export type Subscription<T> = { event: Event<T>; eventHandlers: EventHandler<Event<T>>[] };
export type Subscriptions<T> = Subscription<T>[];
export type ApplicationSubscriptions = {
  domain: Subscriptions<unknown>;
};

export interface IApplicationCommands {
  createUser: CreateUserCommandUseCase;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IApplicationQueries {}

export interface IApplicationSubscriptions {
  domain: [{ event: typeof UserCreated; eventHandlers: EventHandler<UserCreated>[] }];
}
