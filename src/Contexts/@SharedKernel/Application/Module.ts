/**
 * Module wires one bounded context together: its commands, queries, domain events and
 * integration events. It is plain data plus two lookups; the business lives in the handlers.
 *
 * A Module is where the application layer (handlers) is bound to the infrastructure
 * (repositories, queries, external services) and subscribed to the event bus. Each context
 * has one wiring file per environment, e.g. `Contexts/Notes/module.local.ts`:
 *
 * ```typescript
 * export const localNotesModule = new Module({
 *   name: 'Notes',
 *   commands: [{ event: CreateNoteCommandEvent, handlers: [new CreateNoteCommandHandler(noteRepository)] }],
 *   queries: [new GetMyNotesQueryHandler(noteQueries)],
 *   domainEvents: [{ event: NoteCreatedEvent, handlers: [new NoteCreatedHandler()] }],
 * });
 * ```
 *
 * Anything else a context exposes (a middleware, a service another context needs) is a
 * named export of the same wiring file, not a slot in the module.
 *
 * From a controller:
 * ```typescript
 * context.eventBus.publish(CreateNoteCommandEvent.set(payload), context);                    // command, async
 * await notesModule.getQuery(GetMyNotesQueryHandler).executeWithContext(undefined, context); // query
 * ```
 */

import { CommandEvent, Event, IResult } from '@SharedKernel/Domain';
import { CommandHandler } from '@SharedKernel/Application/CommandHandler';
import { EventBus } from '@SharedKernel/Application/EventBus';
import { EventHandler } from '@SharedKernel/Application/EventHandler';
import { QueryHandler } from '@SharedKernel/Application/QueryHandler';

export type CommandSubscription = {
  event: typeof CommandEvent<unknown>;
  handlers: CommandHandler<CommandEvent<unknown>>[];
};

export type EventSubscription = {
  event: typeof Event<unknown>;
  handlers: EventHandler<Event<unknown>>[];
};

type AnyQueryHandler = QueryHandler<unknown, unknown, IResult<unknown>>;

export class Module {
  readonly name: string;
  readonly commands: CommandSubscription[];
  readonly queries: AnyQueryHandler[];
  readonly domainEvents: EventSubscription[];
  readonly integrationEvents: EventSubscription[];

  constructor({
    name,
    commands = [],
    queries = [],
    domainEvents = [],
    integrationEvents = [],
  }: {
    name: string;
    commands?: CommandSubscription[];
    queries?: AnyQueryHandler[];
    domainEvents?: EventSubscription[];
    integrationEvents?: EventSubscription[];
  }) {
    this.name = name;
    this.commands = commands;
    this.queries = queries;
    this.domainEvents = domainEvents;
    this.integrationEvents = integrationEvents;
  }

  async start(eventBus?: EventBus) {
    // eslint-disable-next-line no-console
    console.log(`[************************************] [INFO]  ${this.name} module starting...`);

    if (eventBus) {
      await eventBus.connect().then(this.subscribe.bind(this, eventBus));
    }

    // eslint-disable-next-line no-console
    console.log(`[************************************] [INFO]  ${this.name} module started`);
  }

  async subscribe(eventBus: EventBus) {
    for (const { event, handlers } of [...this.domainEvents, ...this.commands, ...this.integrationEvents]) {
      for (const handler of handlers) {
        await eventBus.subscribe(event.name, handler);
      }
    }
  }

  getCommand(event: typeof CommandEvent<unknown>): CommandHandler<CommandEvent<unknown>> {
    const handler = this.commands.find(command => command.event.name === event.name)?.handlers[0];
    if (!handler) {
      throw new Error(`Missing command ${event.name} in module ${this.name}`);
    }
    return handler;
  }

  getQuery<H extends AnyQueryHandler>(handler: new (...args: never[]) => H): H {
    const query = this.queries.find(query => query instanceof handler);
    if (!query) {
      throw new Error(`Missing query ${handler.name} in module ${this.name}`);
    }
    return query as H;
  }
}
