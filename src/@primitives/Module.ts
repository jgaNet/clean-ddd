import { EventHandler } from './EventHandler';
import { Event } from './Event';
import { EventBus } from '@primitives/EventBus';
import { CommandEvent } from '@primitives/EventTypes';

type ModuleEvent = { event: typeof Event<unknown>; eventHandlers: EventHandler<Event<unknown>>[] };
type ModuleQuery = { name: string; handler: unknown };
export type GenericModule = Module<ModuleEvent[], ModuleQuery[], ModuleEvent[], ModuleEvent[]>;

export class Module<
  Commands extends ModuleEvent[],
  Queries extends ModuleQuery[],
  DomainEvents extends ModuleEvent[],
  IntegrationEvents extends ModuleEvent[],
> {
  commands: Commands;
  queries: Queries;
  domainEvents: DomainEvents;
  integrationEvents: IntegrationEvents;
  eventBus: EventBus;

  constructor({
    commands,
    queries,
    domainEvents,
    integrationEvents,
    eventBus,
  }: {
    commands: Commands;
    queries: Queries;
    domainEvents: DomainEvents;
    integrationEvents: IntegrationEvents;
    eventBus: EventBus;
  }) {
    this.commands = commands;
    this.queries = queries;
    this.domainEvents = domainEvents;
    this.eventBus = eventBus;
    this.integrationEvents = integrationEvents;
  }

  async start() {
    // eslint-disable-next-line no-console
    console.log('[sys][app][info] Module starting...');
    await this.eventBus.connect();
    await this.subscribe();

    // eslint-disable-next-line no-console
    console.log('[sys][app][info] Module started');
  }

  async subscribe() {
    for (const sub of this.domainEvents) {
      for (const eventHandler of sub.eventHandlers) {
        await this.eventBus.subscribe(sub.event, eventHandler);
      }
    }
    for (const sub of this.commands) {
      for (const eventHandler of sub.eventHandlers) {
        await this.eventBus.subscribe(sub.event, eventHandler);
      }
    }
  }

  getCommand(event: typeof CommandEvent<unknown>): EventHandler<CommandEvent<unknown>> {
    const command = this.commands.find(command => command.event.name === event.name)?.eventHandlers;
    if (command) {
      return command[0];
    } else {
      throw 'Missing command';
    }
  }

  getQuery(name: string): unknown {
    const query = this.queries.find(query => query.name === name)?.handler;
    if (query) {
      return query;
    } else {
      throw 'Missing query';
    }
  }
}
