import { IResult, Event } from '@Primitives';
import { ExecutionContext } from '@Primitives/ExecutionContext';

export enum OperationStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  SENT = 'SENT',
  ERROR = 'ERROR',
}

export interface IOperation<T extends Event<unknown> = Event<unknown>> {
  id: string;
  status: OperationStatus;
  result?: IResult<unknown>;
  createdAt: Date;
  finishedAt?: Date;
  event: T;
  context: ExecutionContext; // Optional execution context
}
