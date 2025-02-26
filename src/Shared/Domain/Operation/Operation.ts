import { v4 as uuidv4 } from 'uuid';
import { Event, Result, ResultValue, CommandEvent } from '@Primitives';

export enum OperationStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  SENT = 'SENT',
  ERROR = 'ERROR',
}

export interface IOperation {
  operationId: string;
  status: OperationStatus;
  event: {
    name: string;
    payload: unknown;
  };
  createdAt: Date;
  finishedAt?: Date;
  result?: ResultValue<unknown>;
}

export class Operation<T extends Event<unknown>> {
  id: string;
  status: OperationStatus;
  result?: ResultValue<unknown>;
  createdAt: Date = new Date();
  finishedAt?: Date;
  event: T;
  constructor({ event }: { event: T }) {
    this.id = uuidv4();
    this.status = event instanceof CommandEvent ? OperationStatus.PENDING : OperationStatus.SENT;
    this.event = event;
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

  toJSON(): IOperation {
    return {
      operationId: this.id,
      status: this.status,
      createdAt: this.createdAt,
      finishedAt: this.finishedAt,
      event: {
        name: this.event.name,
        payload: this.event.payload,
      },
      result: this.result,
    };
  }
}
