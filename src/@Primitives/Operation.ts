import { Event, IResult, ExecutionContext } from '@Primitives';

export enum OperationStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  SENT = 'SENT',
  ERROR = 'ERROR',
}

export interface IOperation<T extends Event<unknown>> {
  id: string;
  status: OperationStatus;
  event: T;
  createdAt: Date;
  finishedAt?: Date;
  result?: IResult<unknown>;
  context: ExecutionContext;
  failed: (error: unknown) => IOperation<T>;
  success: (value?: unknown) => IOperation<T>;
  sent: () => IOperation<T>;
}
