import { EventBus } from '@primitives/EventBus';
import { IApplicationSubscriptions, IApplicationQueries, IApplicationCommands } from './dtos';

export class Application {
  commands: IApplicationCommands;
  queries: IApplicationQueries;
  subscriptions: IApplicationSubscriptions;
  eventBus: EventBus;

  constructor({
    commands,
    queries,
    subscriptions,
    eventBus,
  }: {
    commands: IApplicationCommands;
    queries: IApplicationQueries;
    subscriptions: IApplicationSubscriptions;
    eventBus: EventBus;
  }) {
    this.commands = commands;
    this.queries = queries;
    this.subscriptions = subscriptions;
    this.eventBus = eventBus;
    this.subscribe();
  }

  subscribe() {
    this.subscriptions.domain.forEach(({ event, eventHandlers }) => {
      eventHandlers.forEach(eventHandler => {
        this.eventBus.subscribe(event, eventHandler);
      });
    });
  }
}
