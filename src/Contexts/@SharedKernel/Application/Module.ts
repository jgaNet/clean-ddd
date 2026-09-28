/**
 * Module wires one bounded context together: its commands, queries, domain events,
 * integration events and the services it exposes to other contexts.
 *
 * A Module does not contain business logic. It is the place where the application layer
 * (handlers) is bound to the infrastructure (repositories, queries, external services)
 * and subscribed to the event bus. Each context has one such wiring file per environment,
 * e.g. `Contexts/Notes/module.local.ts`.
 *
 * Build one with the ModuleBuilder:
 * ```typescript
 * export const localNotesModule = new ModuleBuilder<NotesModule>(Symbol('Notes'))
 *   .setCommand({ event: CreateNoteCommandEvent, handlers: [new CreateNoteCommandHandler(noteRepository)] })
 *   .setQuery(new GetMyNotesQueryHandler(noteQueries))
 *   .setDomainEvent({ event: NoteSharedEvent, handlers: [new NoteSharedHandler()] })
 *   .build();
 * ```
 *
 * Then, from a controller:
 * ```typescript
 * context.eventBus.publish(CreateNoteCommandEvent.set(payload), context);        // async command
 * await notesModule.getQuery(GetMyNotesQueryHandler).executeWithContext(undefined, context); // query
 * ```
 */

import { Result, CommandEvent, Event } from '@SharedKernel/Domain';
import { CommandHandler } from '@SharedKernel/Application/CommandHandler';
import { EventBus } from '@SharedKernel/Application/EventBus';
import { EventHandler } from '@SharedKernel/Application/EventHandler';
import { QueryHandler } from '@SharedKernel/Application/QueryHandler';

type CommandModuleEvent = {
  event: typeof Event<unknown>;
  handlers: CommandHandler<CommandEvent<unknown>>[];
};
type ModuleEvent = { event: typeof Event<unknown>; handlers: EventHandler<Event<unknown>>[] };
type ModuleQuery = {
  name: string;
  handler: QueryHandler<unknown, unknown, Result<unknown>>;
};

type ModuleServices = Record<string, unknown>;

export type GenericModule = Module<CommandModuleEvent[], ModuleQuery[], ModuleEvent[], ModuleEvent[], ModuleServices>;

export class ModuleBuilder<T extends GenericModule> {
  #module: GenericModule;

  constructor(name: symbol) {
    this.#module = new Module({
      name,
      commands: [],
      queries: [],
      domainEvents: [],
      integrationEvents: [],
      services: {},
    });
  }

  setCommand({ event, handlers }: CommandModuleEvent) {
    this.#module.commands.push({ event, handlers });
    return this;
  }

  setQuery(queryHandler: ModuleQuery['handler']) {
    this.#module.queries.push({ name: queryHandler.constructor.name, handler: queryHandler });
    return this;
  }

  setDomainEvent({ event, handlers }: ModuleEvent) {
    this.#module.domainEvents.push({ event, handlers });
    return this;
  }

  setIntegrationEvent({ event, handlers }: ModuleEvent) {
    this.#module.integrationEvents.push({ event, handlers });
    return this;
  }

  setService(name: string, service: unknown) {
    this.#module.services[name] = service;
    return this;
  }

  build() {
    return this.#module as T;
  }
}

export class Module<
  Commands extends CommandModuleEvent[],
  Queries extends ModuleQuery[],
  DomainEvents extends ModuleEvent[],
  IntegrationEvents extends ModuleEvent[],
  Services extends ModuleServices,
> {
  #name: symbol;
  commands: Commands;
  queries: Queries;
  domainEvents: DomainEvents;
  integrationEvents: IntegrationEvents;
  services: Services;

  constructor({
    name,
    commands,
    queries,
    domainEvents,
    integrationEvents,
    services,
  }: {
    name: symbol;
    commands: Commands;
    queries: Queries;
    domainEvents: DomainEvents;
    integrationEvents: IntegrationEvents;
    services: Services;
  }) {
    this.#name = name;
    this.commands = commands;
    this.queries = queries;
    this.domainEvents = domainEvents;
    this.integrationEvents = integrationEvents;
    this.services = services;
  }

  getName() {
    return this.#name;
  }

  async start(eventBus?: EventBus) {
    // eslint-disable-next-line no-console
    console.log(`[************************************] [INFO]  ${this.getName().description} module starting...`);

    if (eventBus) {
      await eventBus.connect().then(this.subscribe.bind(this, eventBus));
    }

    // eslint-disable-next-line no-console
    console.log(`[************************************] [INFO]  ${this.getName().description} module started`);
  }

  async subscribe(eventBus: EventBus) {
    for (const sub of this.domainEvents) {
      for (const handler of sub.handlers) {
        await eventBus.subscribe(sub.event.name, handler);
      }
    }
    for (const sub of this.commands) {
      for (const handler of sub.handlers) {
        await eventBus.subscribe(sub.event.name, handler);
      }
    }
    for (const sub of this.integrationEvents) {
      for (const handler of sub.handlers) {
        await eventBus.subscribe(sub.event.name, handler);
      }
    }
  }

  getCommand(event: typeof CommandEvent<unknown>): EventHandler<CommandEvent<unknown>> {
    const command = this.commands.find(command => command.event.name === event.name)?.handlers;
    if (command) {
      return command[0];
    } else {
      throw new Error(`Missing command ${event.name}`);
    }
  }

  getQuery<H extends ModuleQuery['handler']>(handler: abstract new (...args: never[]) => H): H {
    const query = this.queries.find(query => query.name === handler.name)?.handler;
    if (query) {
      return query as H;
    } else {
      throw new Error(`Missing query ${handler.name}`);
    }
  }
}
