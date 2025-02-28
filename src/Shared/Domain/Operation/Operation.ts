import { v4 as uuidv4 } from 'uuid';
import { Event, Result, ResultValue, CommandEvent } from '@Primitives';
import { OperationStatus, IOperation } from './DTOs';

export class Operation<T extends Event<unknown>> {
  id: string;
  status: OperationStatus;
  result?: ResultValue<unknown>;
  createdAt: Date = new Date();
  finishedAt?: Date;
  event: T;

  constructor(operation: IOperation) {
    this.id = operation.id;
    this.status = operation.status;
    this.result = operation.result;
    this.createdAt = operation.createdAt;
    this.finishedAt = operation.finishedAt;
    this.event = operation.event as T;
  }

  static create<T = unknown>({ event }: { event: Event<T> }): Operation<Event<T>> {
    const operation = new Operation<Event<T>>({
      id: uuidv4(),
      status: event instanceof CommandEvent ? OperationStatus.PENDING : OperationStatus.SENT,
      result: undefined,
      createdAt: new Date(),
      finishedAt: undefined,
      event,
    });
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
