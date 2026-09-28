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
 * // Using in a command handler: see Contexts/Notes/Application/Commands
 * async execute({ payload }: EditNoteCommandEvent, context: ExecutionContext): Promise<IResult> {
 *   const note = await this.noteRepository.findById(payload.noteId);
 *   ...
 *   this.publishDomainEvents(note, context); // uses context.eventBus
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

import { IResult, Result, Role } from '@SharedKernel/Domain';
import { EventBus } from '@SharedKernel/Application/EventBus';

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
  #inTransaction = false;
  #afterCommit: Array<() => void> = [];

  constructor(options: ExecutionContextOptions) {
    this.#traceId = options.traceId;
    this.#auth = {
      subjectId: options.auth?.subjectId,
      role: options.auth?.role,
    };
    this.#eventBus = options.eventBus;
    this.#unitOfWork = options.unitOfWork;
    this.#logger = options.logger;
  }

  /**
   * Runs `fn` inside the unit of work when there is one, then runs the `afterCommit`
   * callbacks registered during `fn` once the transaction is committed. A failed result
   * or a throw rolls back and drops those callbacks. Nested calls join the outer transaction.
   */
  async withTransaction<T>(fn: () => Promise<IResult<T>>): Promise<IResult<T>> {
    const outermost = !this.#inTransaction;
    this.#inTransaction = true;

    try {
      const result = await this.runInUnitOfWork(fn);

      if (outermost) {
        const callbacks = this.#afterCommit;
        this.#afterCommit = [];
        if (result.isSuccess()) callbacks.forEach(callback => callback());
      }

      return result;
    } finally {
      if (outermost) this.#inTransaction = false;
    }
  }

  /**
   * Defers `callback` until the current transaction is committed, so that its side effects
   * (typically publishing domain events) never leak facts that end up rolled back.
   * Outside of any transaction the callback runs immediately.
   */
  afterCommit(callback: () => void): void {
    if (!this.#inTransaction) {
      callback();
      return;
    }
    this.#afterCommit.push(callback);
  }

  private async runInUnitOfWork<T>(fn: () => Promise<IResult<T>>): Promise<IResult<T>> {
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
}
