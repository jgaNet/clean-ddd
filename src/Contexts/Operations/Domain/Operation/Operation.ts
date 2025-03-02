import { v4 as uuidv4 } from 'uuid';
import { Event, Result, IResult, CommandEvent, EventBus } from '@Primitives';
import { OperationStatus, IOperation } from './DTOs';

export class Operation<T extends Event<unknown>> implements IOperation<T> {
  id: string;
  status: OperationStatus;
  result?: IResult<unknown>;
  createdAt: Date = new Date();
  finishedAt?: Date;
  eventBus: EventBus;
  event: T;

  constructor(operation: IOperation<T>) {
    this.id = operation.id;
    this.status = operation.status;
    this.result = operation.result;
    this.createdAt = operation.createdAt;
    this.finishedAt = operation.finishedAt;
    this.eventBus = operation.eventBus;
    this.event = operation.event;
  }

  static create<T = unknown>({ event, eventBus }: { event: Event<T>; eventBus: EventBus }): Operation<Event<T>> {
    const operation = new Operation<Event<T>>({
      id: uuidv4(),
      status: event instanceof CommandEvent ? OperationStatus.PENDING : OperationStatus.SENT,
      result: undefined,
      createdAt: new Date(),
      eventBus,
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
