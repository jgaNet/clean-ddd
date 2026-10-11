import { IEvent, IResult } from '@Architecture/Domain';
import { ExecutionContext } from '@Architecture/Application/ExecutionContext';

export enum OperationStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  SENT = 'SENT',
  ERROR = 'ERROR',
}

export interface IOperation<T extends IEvent<unknown>, S extends OperationStatus = OperationStatus> {
  id: string;
  status: S;
  event: T;
  createdAt: Date;
  finishedAt?: Date;
  result?: IResult<unknown>;
  context: ExecutionContext;
  failed: (error: unknown) => IOperation<T>;
  success: (value?: unknown) => IOperation<T>;
  sent: () => IOperation<T>;
}
