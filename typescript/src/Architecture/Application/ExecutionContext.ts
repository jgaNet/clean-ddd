/**
 * ExecutionContext travels with one request through every handler it reaches: who is
 * calling (`auth`: a subject id and a role, as strings — which roles exist is the shared kernel's
 * business, not the mechanics'), how to correlate the logs (`traceId`), and the services a use case may
 * need without owning them (`logger`, `eventBus`, `unitOfWork`). That is the whole list, on
 * purpose: each member exists per request. Anything a handler needs that does not (a mailer,
 * a clock, a model client) is a constructor dependency, so that the handler's needs stay in
 * its signature and the context does not become a service locator.
 *
 * The bootstrap builds one per HTTP request (Bootstrap/Fastify/createApplication.ts); tests build
 * one by hand:
 *
 *   new ExecutionContext({ traceId: 'trace', eventBus, auth: { subjectId: 'alice', role: 'USER' } })
 *
 * A handler reads `context.auth` to know the caller and passes `context` on when it
 * publishes. `withTransaction()`, `beforeCommit()` and `afterCommit()` are what make "durable,
 * then published" possible: the events are appended to the unit of work's outbox at commit and
 * relayed after it (docs/adr/0003-publish-domain-events-after-commit.md, docs/adr/0024-events-are-durable-before-they-are-published.md).
 */

import { IResult, Result } from '@Architecture/Domain';
import { EventBus } from '@Architecture/Application/EventBus';
import { Outbox, relayOutbox } from '@Architecture/Application/Outbox';

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
   * Whether a transaction is open. The context owns its transaction: it asks this before opening
   * one, and a transaction already open there is a programming error, not one to join.
   */
  hasActiveTransaction(): boolean;

  /** The transactional outbox: what this transaction makes durable to be published after it commits (ADR 24). */
  readonly outbox: Outbox;

  /**
   * A unit of work over the same stores and the same outbox, for a transaction of its own: the one
   * a reaction runs in (ADR 30). With a database, another transaction from the same pool.
   */
  another(): UnitOfWork;
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
    role?: string;
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
    role?: string | undefined;
  };
  readonly #eventBus: EventBus;
  readonly #unitOfWork?: UnitOfWork;
  readonly #logger?: Logger;
  #inTransaction = false;
  #beforeCommit: Array<() => void> = [];
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
   * Runs `fn` inside the unit of work when there is one: the `beforeCommit` steps registered
   * during `fn` run inside the transaction once `fn` has succeeded (the outbox is written
   * there), then the transaction commits, then the outbox is relayed through the bus, then the
   * `afterCommit` callbacks run. A failed result or a throw rolls back and drops every step and
   * callback — whatever the failure, so a context is clean for its next transaction even after a
   * unit of work that could not begin or roll back. Nested calls join the outer transaction:
   * everything happens at the outermost one. The context owns that transaction: it opens it and
   * closes it, and a unit of work that already has one open at the outermost call is a
   * programming error (the steps and callbacks would otherwise run against a commit this context
   * never sees), so it throws.
   */
  async withTransaction<T>(fn: () => Promise<IResult<T>>): Promise<IResult<T>> {
    const outermost = !this.#inTransaction;
    this.#inTransaction = true;

    try {
      const result = await this.runInUnitOfWork(fn, outermost);

      if (outermost && result.isSuccess()) {
        const callbacks = this.#afterCommit;
        this.#afterCommit = [];
        this.relay();
        callbacks.forEach(callback => callback());
      }

      return result;
    } finally {
      if (outermost) {
        this.#inTransaction = false;
        this.#beforeCommit = [];
        this.#afterCommit = [];
      }
    }
  }

  /**
   * Runs `step` inside the current transaction, once the use case has succeeded and just before
   * the commit: where `publishDomainEvents()` appends the aggregate's events to the outbox, so
   * that they are durable with the state they describe and gone with it on a rollback.
   * Outside of any transaction (a handler's unit spec calling `execute()` directly) there is
   * nothing to wait for: the step runs immediately and what it stored is relayed at once.
   */
  beforeCommit(step: () => void): void {
    if (!this.#inTransaction) {
      step();
      this.relay();
      return;
    }
    this.#beforeCommit.push(step);
  }

  /** Publishes what the unit of work's outbox holds, with each entry's id as the message's (ADR 24). */
  private relay(): void {
    if (this.#unitOfWork) relayOutbox(this.#unitOfWork.outbox, this.#eventBus, this);
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

  /** The `beforeCommit` steps, inside the transaction, once the outermost use case has succeeded. */
  private runBeforeCommit(): void {
    const steps = this.#beforeCommit;
    this.#beforeCommit = [];
    steps.forEach(step => step());
  }

  private async runInUnitOfWork<T>(fn: () => Promise<IResult<T>>, outermost: boolean): Promise<IResult<T>> {
    if (!this.#unitOfWork) {
      const result = await fn();
      if (outermost && result.isSuccess()) this.runBeforeCommit();
      return result;
    }

    if (outermost) {
      if (this.#unitOfWork.hasActiveTransaction()) {
        throw new Error(
          'The unit of work already has a transaction open: the context owns its transaction and opens it itself, nothing else may begin one',
        );
      }
      await this.#unitOfWork.beginTransaction();
    }

    const failed = (error: unknown): IResult<T> => {
      this.#logger?.error('Transaction failed', error, { traceId: this.#traceId, userId: this.#auth.subjectId });
      return Result.fail(error);
    };

    let result: IResult<T>;
    try {
      result = await fn();
    } catch (error) {
      result = failed(error);
    }
    if (!outermost) return result;

    if (result.isFailure()) {
      await this.#unitOfWork.rollbackTransaction();
      return result;
    }
    try {
      this.runBeforeCommit();
      await this.#unitOfWork.commitTransaction();
      return result;
    } catch (error) {
      await this.#unitOfWork.rollbackTransaction();
      return failed(error);
    }
  }

  /**
   * The context a reaction to this request's facts runs in (ADR 30): the same caller, trace, bus
   * and logger, and a unit of work of its own. A reaction's transaction is its own — not the one
   * that published the fact, which has committed, nor the one of another reaction to the same
   * fact, running beside it.
   */
  forReaction(): ExecutionContext {
    return new ExecutionContext({
      traceId: this.#traceId,
      auth: this.#auth,
      eventBus: this.#eventBus,
      unitOfWork: this.#unitOfWork?.another(),
      logger: this.#logger,
    });
  }

  /**
   * The trace ID for the current execution
   */
  get traceId(): string {
    return this.#traceId;
  }

  /** Who is calling: the subject's id and role, both absent for an anonymous request. */
  get auth(): { subjectId?: string; role?: string } {
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
