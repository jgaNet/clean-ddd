import { v4 as uuidv4 } from 'uuid';
import { Event, Result, IResult } from '@Primitives';
import { ExecutionContext } from '@Primitives/ExecutionContext';
import { OperationStatus, IOperation } from './DTOs';

export class Operation<T extends Event<unknown>> implements IOperation<T> {
  id: string;
  status: OperationStatus;
  result?: IResult<unknown>;
  createdAt: Date = new Date();
  finishedAt?: Date;
  event: T;
  context: ExecutionContext;

  constructor(operation: IOperation<T>) {
    this.id = operation.id;
    this.status = operation.status;
    this.result = operation.result;
    this.createdAt = operation.createdAt;
    this.finishedAt = operation.finishedAt;
    this.event = operation.event;
    this.context = operation.context;
  }

  static create<T = unknown>({ event, context }: { event: Event<T>; context: ExecutionContext }): Operation<Event<T>> {
    const operation = new Operation<Event<T>>({
      id: uuidv4(), // Use trace ID from context if available
      status: OperationStatus.PENDING,
      result: undefined,
      createdAt: new Date(),
      finishedAt: undefined,
      event,
      context, // Include the execution context
    });

    // Log operation creation if context has a logger
    if (context?.logger) {
      context.logger.debug(`Operation created: ${operation.id}`, {
        traceId: context.traceId,
        eventType: event.constructor.name,
      });
    }

    return operation;
  }

  get name(): string {
    return this.event.constructor.name;
  }

  get payload(): unknown {
    return this.event.payload;
  }

  failed(error: unknown): Operation<T> {
    this.status = OperationStatus.ERROR;
    this.result = Result.fail(error);
    this.finishedAt = new Date();
    return this;
  }

  success(value?: unknown): Operation<T> {
    this.status = OperationStatus.SUCCESS;
    this.result = Result.ok(value);
    this.finishedAt = new Date();
    return this;
  }

  sent(): Operation<T> {
    this.status = OperationStatus.SENT;
    return this;
  }
}
