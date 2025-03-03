/**
 * Module Primitive
 *
 * Purpose:
 * A foundational class that implements the Modular Architecture pattern,
 * combining CQRS and Event-Driven Architecture for bounded contexts.
 *
 * Architecture Components:
 *
 * 1. Commands (Write Operations):
 *    - Handle state changes (create, update, delete)
 *    - Example:
 *    ```typescript
 *    class CreateUserCommand implements Command {
 *      constructor(public readonly userData: UserDTO) {}
 *    }
 *    ```
 *
 * 2. Queries (Read Operations):
 *    - Retrieve data without state changes
 *    - Example:
 *    ```typescript
 *    class GetUserByIdQuery implements Query {
 *      constructor(public readonly userId: string) {}
 *    }
 *    ```
 *
 * 3. Events:
 *    a. Domain Events (Internal):
 *       - Represent state changes within the module
 *       ```typescript
 *       class UserCreatedEvent extends DomainEvent {
 *         constructor(public readonly user: User) {}
 *       }
 *       ```
 *
 *    b. Integration Events (External):
 *       - Communicate between different modules
 *       ```typescript
 *       class UserVerifiedIntegrationEvent extends IntegrationEvent {
 *         constructor(public readonly userId: string) {}
 *       }
 *       ```
 *
 * Example Usage:
 *
 * 1. Module Definition:
 *    ```typescript
 *    export class UsersModule extends Module {
 *      constructor() {
 *        super({
 *          commands: [
 *            { event: CreateUserCommand, handlers: [createUserHandler] }
 *          ],
 *          queries: [
 *            { name: 'GetUserById', handler: getUserByIdHandler }
 *          ],
 *          domainEvents: [
 *            { event: UserCreatedEvent, handlers: [notifyAdminHandler] }
 *          ],
 *          integrationEvents: [
 *            { event: UserVerifiedEvent, handlers: [updateAuthHandler] }
 *          ]
 *        });
 *      }
 *    }
 *    ```
 *
 * 2. Module Usage:
 *    ```typescript
 *    const usersModule = new UsersModule();
 *
 *    // Start module (connects event bus and subscribes handlers)
 *    await usersModule.start();
 *
 *    // Execute command
 *    const command = new CreateUserCommand({ email: 'user@example.com' });
 *    const handler = usersModule.getCommand(CreateUserCommand);
 *    await handler.execute(command);
 *
 *    // Execute query
 *    const query = new GetUserByIdQuery('user-123');
 *    const result = await usersModule.getQuery(GetUserByIdQuery).execute(query);
 *    ```
 *
 * Key Features:
 * 1. Type Safety: Full TypeScript support for all components
 * 2. Automatic Event Handling: Self-registering event subscriptions
 * 3. Dependency Management: Built-in dependency injection support
 * 4. Bounded Context Isolation: Clear module boundaries
 * 5. Scalability: Easy to add new commands, queries, and events
 *
 * Benefits:
 * - Clear separation of read and write operations
 * - Explicit event-driven communication
 * - Modular and maintainable codebase
 * - Easy to test and mock components
 * - Scalable architecture pattern
 */

import {
  Result,
  DataSource,
  QueriesService,
  QueryHandler,
  CommandEvent,
  EventBus,
  Event,
  CommandHandler,
  EventHandler,
} from '@Primitives';

type CommandModuleEvent = {
  event: typeof Event<unknown>;
  handlers: CommandHandler<CommandEvent<unknown>>[];
};
type ModuleEvent = { event: typeof Event<unknown>; handlers: EventHandler<Event<unknown>>[] };
type ModuleQuery = {
  name: string;
  handler: QueryHandler<QueriesService<DataSource<unknown>>, unknown, Result<unknown>>;
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

  setEventBus(eventBus: EventBus) {
    this.#module.setEventBus(eventBus);
    return this;
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
  #eventBus?: EventBus;

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

  get eventBus() {
    if (!this.#eventBus) {
      throw 'Missing event bus';
    }
    return this.#eventBus;
  }

  getName() {
    return this.#name;
  }

  setEventBus(eventBus: EventBus) {
    this.#eventBus = eventBus;
    return this;
  }

  async start() {
    // eslint-disable-next-line no-console
    console.log(`[sys][app][info] ${this.getName().description} module starting...`);
    if (!this.#eventBus) {
      throw 'Missing event bus';
    }

    await this.#eventBus.connect().then(this.subscribe.bind(this));

    // eslint-disable-next-line no-console
    console.log(`[sys][module][info] ${this.getName().description} module started`);
  }

  async subscribe() {
    if (!this.#eventBus) {
      throw 'Missing event bus';
    }

    for (const sub of this.domainEvents) {
      for (const handler of sub.handlers) {
        await this.#eventBus.subscribe(sub.event.name, handler);
      }
    }
    for (const sub of this.commands) {
      for (const handler of sub.handlers) {
        await this.#eventBus.subscribe(sub.event.name, handler);
      }
    }
  }

  getCommand(event: typeof CommandEvent<unknown>): EventHandler<CommandEvent<unknown>> {
    const command = this.commands.find(command => command.event.name === event.name)?.handlers;
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
