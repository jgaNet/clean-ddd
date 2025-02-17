/**
 * Module is a core primitive class that serves as the foundation for organizing and
 * managing different aspects of a bounded context in the application.
 *
 * This class implements a modular architecture pattern that combines CQRS (Command Query
 * Responsibility Segregation) with event-driven design.
 *
 * Key components:
 * - Commands: Handles state-changing operations
 * - Queries: Manages read operations
 * - Domain Events: Internal events within the bounded context
 * - Integration Events: Events shared between different modules
 * - Event Bus: Communication infrastructure
 *
 * Core features:
 * - Type-safe event handling through generics
 * - Automated event subscription management
 * - Command and query handler resolution
 * - Module lifecycle management (start, subscribe)
 *
 * Usage in the project:
 * - Base class for all context modules (e.g., UsersManagerModule)
 * - Manages command/query registration and resolution
 * - Handles event subscriptions and routing
 * - Provides dependency injection container capabilities
 */

import { EventHandler } from '@Primitives/EventHandler';
import { CommandHandler } from '@Primitives/CommandHandler';
import { Event } from '@Primitives/Event';
import { EventBus } from '@Primitives/EventBus';
import { CommandEvent } from '@Primitives/EventTypes';
import { QueryHandler } from '@Primitives/QueryHandler';
import { QueriesService } from '@Primitives/QueriesService';
import { DataSource } from '@Primitives/DataSource';
import { Result } from '@Primitives/Result';

type CommandModuleEvent = { event: typeof Event<unknown>; eventHandlers: CommandHandler<Event<unknown>>[] };
type ModuleEvent = { event: typeof Event<unknown>; eventHandlers: EventHandler<Event<unknown>>[] };
type ModuleQuery = {
  name: string;
  handler: QueryHandler<QueriesService<DataSource<unknown>>, unknown, Result<unknown>>;
};

export type GenericModule = Module<CommandModuleEvent[], ModuleQuery[], ModuleEvent[], ModuleEvent[]>;

export class Module<
  Commands extends CommandModuleEvent[],
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

  getQuery(
    handler: typeof QueryHandler<QueriesService<DataSource<unknown>>, unknown, Result<unknown>>,
  ): QueryHandler<QueriesService<DataSource<unknown>>, unknown, Result<unknown>> {
    const query = this.queries.find(query => query.name.toString() === handler.name)?.handler;
    if (query) {
      return query;
    } else {
      throw 'Missing query';
    }
  }
}
