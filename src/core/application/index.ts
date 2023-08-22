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
  }

  async start() {
    console.log('[sys][app][info] Application starting...');
    await this.eventBus.connect();
    await this.subscribe();
    console.log('[sys][app][info] Application started');
  }

  async subscribe() {
    for (const sub of this.subscriptions.domain) {
      for (const eventHandler of sub.eventHandlers) {
        await this.eventBus.subscribe(sub.event, eventHandler);
      }
    }
  }
}
