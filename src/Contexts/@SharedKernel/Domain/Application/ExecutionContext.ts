/**
 * ExecutionContext is a core primitive that represents the execution environment
 * for command handlers, query handlers, and event handlers.
 *
 * This class provides a shared context across the execution pipeline, containing
 * essential services, transaction management, and contextual information that can be
 * propagated from the initial request through all layers of the application.
 *
 * Key characteristics:
 * - Encapsulates cross-cutting concerns like logging, transactions and event publishing
 * - Provides tracing capabilities for request tracking
 * - Enables consistent error handling and transaction management
 * - Follows the Context Object pattern to carry execution-scoped information
 *
 * Usage example:
 * ```typescript
 * // Creating an execution context
 * const context = new ExecutionContext({
 *   traceId: '1234-5678',
 *   userId: 'user-1',
 *   eventBus: new InMemoryEventBus(),
 *   unitOfWork: new InMemoryUnitOfWork(),
 *   logger: new ConsoleLogger()
 * });
 *
 * // Using in a command handler
 * export class CreateUserCommandHandler extends CommandHandler<CreateUserCommand> {
 *   async execute(command: CreateUserCommand, context: ExecutionContext): Promise<Result<string>> {
 *     // Start transaction
 *     return context.withTransaction(async () => {
 *       // Log with contextual information
 *       context.logger.info(`Creating user with email ${command.payload.email}`, {
 *         traceId: context.traceId
 *       });
 *
 *       // Business logic
 *       const user = User.create(command.payload);
 *       await this.userRepository.save(user);
 *
 *       // Publish domain events
 *       await context.eventBus.publish(new UserCreatedEvent({
 *         userId: user.id
 *       }));
 *
 *       return Result.ok(user.id);
 *     });
 *   }
 * }
 * ```
 *
 * Related components:
 * - {@link CommandHandler} - Uses the execution context for command processing
 * - {@link QueryHandler} - Uses the execution context for query processing
 * - {@link EventHandler} - Uses the execution context for event processing
 * - {@link UnitOfWork} - Provides transaction management capabilities
 * - {@link EventBus} - Provides event publishing capabilities
 */

import { EventBus } from '../Services/EventBus';
import { IResult, Result } from './Result';
import { Role } from '../AccessControl/Role';

/**
 * Interface for a Unit of Work, which manages transactional boundaries
 */
export interface UnitOfWork {
  /**
   * Starts a new transaction
   */
  beginTransaction(): Promise<void>;

  /**
   * Commits the current transaction
   */
  commitTransaction(): Promise<void>;

  /**
   * Rolls back the current transaction
   */
  rollbackTransaction(): Promise<void>;

  /**
   * Checks if there is an active transaction
   */
  hasActiveTransaction(): boolean;
}

/**
 * Interface for a Logger
 */
export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, error?: unknown, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
}

/**
 * Interface for context options
 */
export interface ExecutionContextOptions {
  /**
   * The traceId for the current execution - used for distributed tracing
   */
  traceId: string;

  /**
   * Optional authenticated user ID
   */
  auth: {
    // The authenticated user ID
    subjectId?: string;

    // The authenticated user role
    role?: Role;
  };

  /**
   * The event bus for publishing domain events
   */
  eventBus: EventBus;

  /**
   * The unit of work for transaction management
   */
  unitOfWork?: UnitOfWork;

  /**
   * Logger instance
   */
  logger?: Logger;

  /**
   * Additional contextual data
   */
  metadata?: Record<string, unknown>;
}

/**
 * Execution context for the application
 */
export class ExecutionContext {
  readonly #traceId: string;
  readonly #auth: {
    subjectId?: string | undefined;
    role?: Role | undefined;
  };
  readonly #eventBus: EventBus;
  readonly #unitOfWork?: UnitOfWork;
  readonly #logger?: Logger;
  readonly #metadata: Record<string, unknown>;

  constructor(options: ExecutionContextOptions) {
    this.#traceId = options.traceId;
    this.#auth = {
      subjectId: options.auth?.subjectId,
      role: options.auth?.role,
    };
    this.#eventBus = options.eventBus;
    this.#unitOfWork = options.unitOfWork;
    this.#logger = options.logger;
    this.#metadata = options.metadata || {};
  }

  /**
   * Execute a function within a transaction
   * @param fn The function to execute
   * @returns The result of the function
   */
  async withTransaction<T>(fn: () => Promise<IResult<T>>): Promise<IResult<T>> {
    if (!this.#unitOfWork) {
      return fn();
    }

    const hasExistingTransaction = this.#unitOfWork.hasActiveTransaction();

    if (!hasExistingTransaction) {
      await this.#unitOfWork.beginTransaction();
    }

    try {
      const result = await fn();

      if (result.isFailure()) {
        if (!hasExistingTransaction) {
          await this.#unitOfWork.rollbackTransaction();
        }
        return result;
      }

      if (!hasExistingTransaction) {
        await this.#unitOfWork.commitTransaction();
      }

      return result;
    } catch (error) {
      if (!hasExistingTransaction) {
        await this.#unitOfWork.rollbackTransaction();
      }

      if (this.#logger) {
        this.#logger.error('Transaction failed', error, {
          traceId: this.#traceId,
          userId: this.#auth.subjectId,
        });
      }

      return Result.fail(error);
    }
  }

  /**
   * The trace ID for the current execution
   */
  get traceId(): string {
    return this.#traceId;
  }

  /**
   * The authenticated user ID, if available
   */
  get subjectId(): string | undefined {
    return this.#auth.subjectId;
  }

  /**
   * The authenticated user role, if available
   */
  get auth(): { subjectId?: string; role?: Role } {
    return this.#auth;
  }

  /**
   * The event bus for publishing domain events
   */
  get eventBus(): EventBus {
    return this.#eventBus;
  }

  /**
   * The unit of work for transaction management
   */
  get unitOfWork(): UnitOfWork | undefined {
    return this.#unitOfWork;
  }

  /**
   * The logger for logging information
   */
  get logger(): Logger | undefined {
    return this.#logger;
  }

  /**
   * Get metadata from the context
   * @param key The metadata key
   * @returns The metadata value or undefined
   */
  getMetadata<T>(key: string): T | undefined {
    return this.#metadata[key] as T | undefined;
  }

  /**
   * Create a new context with additional metadata
   * @param metadata Additional metadata to add
   * @returns A new execution context with combined metadata
   */
  withMetadata(metadata: Record<string, unknown>): ExecutionContext {
    return new ExecutionContext({
      traceId: this.#traceId,
      auth: {
        subjectId: this.#auth.subjectId,
        role: this.#auth.role,
      },
      eventBus: this.#eventBus,
      unitOfWork: this.#unitOfWork,
      logger: this.#logger,
      metadata: {
        ...this.#metadata,
        ...metadata,
      },
    });
  }
}
