import { EventBus } from '@primitives/EventBus';
import { ApplicationDomainEvents, IApplicationQueries, ApplicationCommands } from './dtos';
import { CommandEvent } from '@primitives/EventTypes';
import { EventHandler } from '@primitives/EventHandler';

export class UsersManagerModule {
  #commands: ApplicationCommands;
  queries: IApplicationQueries;
  domainEvents: ApplicationDomainEvents;
  eventBus: EventBus;

  constructor({
    commands,
    queries,
    domainEvents,
    eventBus,
  }: {
    commands: ApplicationCommands;
    queries: IApplicationQueries;
    domainEvents: ApplicationDomainEvents;
    eventBus: EventBus;
  }) {
    this.#commands = commands;
    this.queries = queries;
    this.domainEvents = domainEvents;
    this.eventBus = eventBus;
  }

  async start() {
    console.log('[sys][app][info] Application starting...');
    await this.eventBus.connect();
    await this.subscribe();
    console.log('[sys][app][info] Application started');
  }

  async subscribe() {
    for (const sub of this.domainEvents) {
      for (const eventHandler of sub.eventHandlers) {
        await this.eventBus.subscribe(sub.event, eventHandler);
      }
    }
    for (const sub of this.#commands) {
      for (const eventHandler of sub.eventHandlers) {
        await this.eventBus.subscribe(sub.event, eventHandler);
      }
    }
  }

  getCommand(event: typeof CommandEvent<unknown>): EventHandler<CommandEvent<unknown>> {
    const command = this.#commands.find(command => command.event.name == event.name)?.eventHandlers;
    if (command) {
      return command[0];
    } else {
      throw 'Missing command';
    }
  }
}
