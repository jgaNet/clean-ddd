import { v4 as uuidv4 } from 'uuid';
import { Event } from './Event';

export enum OperationStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
}

export interface OperationDTO {
  operationId: string;
  status: OperationStatus;
}

export class Operation<T extends Event<unknown>> {
  id: string;
  status: OperationStatus;
  #event: T;
  constructor(event: T) {
    this.id = uuidv4();
    this.status = OperationStatus.PENDING;
    this.#event = event;
  }

  get event(): T {
    return this.#event;
  }

  toJSON(): OperationDTO {
    return {
      operationId: this.id,
      status: this.status,
    };
  }
}
