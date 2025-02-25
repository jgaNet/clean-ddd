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

import { EventHandler } from '@Primitives/EventHandler';
import { CommandHandler } from '@Primitives/CommandHandler';
import { Event } from '@Primitives/Event';
import { EventBus } from '@Primitives/EventBus';
import { CommandEvent } from '@Primitives/EventTypes';
import { QueryHandler } from '@Primitives/QueryHandler';
import { QueriesService } from '@Primitives/QueriesService';
import { DataSource } from '@Primitives/DataSource';
import { Result } from '@Primitives/Result';

type CommandModuleEvent = { event: typeof Event<unknown>; eventHandlers: CommandHandler<CommandEvent<unknown>>[] };
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
