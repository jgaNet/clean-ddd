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
 * await notesModule.getQuery(GetMyNotesQueryHandler).handle(undefined, context); // query, sync
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
    if (eventBus) {
      await eventBus.connect().then(this.subscribe.bind(this, eventBus));
    }
  }

  async subscribe(eventBus: EventBus) {
    for (const { event, handlers } of [...this.domainEvents, ...this.commands, ...this.integrationEvents]) {
      for (const handler of handlers) {
        await eventBus.subscribe(event.name, handler);
      }
    }
  }

  /** For the rare command a caller runs synchronously instead of publishing it (see Login). */
  getCommand<H extends CommandHandler<CommandEvent<unknown>>>(handler: new (...args: never[]) => H): H {
    const found = this.commands.flatMap(command => command.handlers).find(candidate => candidate instanceof handler);
    if (!found) {
      throw new Error(`Missing command handler ${handler.name} in module ${this.name}`);
    }
    return found as H;
  }

  getQuery<H extends AnyQueryHandler>(handler: new (...args: never[]) => H): H {
    const query = this.queries.find(query => query instanceof handler);
    if (!query) {
      throw new Error(`Missing query ${handler.name} in module ${this.name}`);
    }
    return query as H;
  }
}
