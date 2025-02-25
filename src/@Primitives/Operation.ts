import { v4 as uuidv4 } from 'uuid';
import { Event } from './Event';

export enum OperationStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
}

export class Operation<T extends Event<unknown>> {
  id: string;
  status: OperationStatus;
  #event: T;
  constructor(event: T) {
    this.id = uuidv4();
    this.#event = event;
    this.status = OperationStatus.PENDING;
  }

  get event(): T {
    return this.#event;
  }

  toJSON(): {
    operationId: string;
    status: OperationStatus;
  } {
    return {
      operationId: this.id,
      status: this.status,
    };
  }
}
