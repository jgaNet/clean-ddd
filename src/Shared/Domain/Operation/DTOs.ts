import { ResultValue, IEvent } from '@Primitives';

export enum OperationStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  SENT = 'SENT',
  ERROR = 'ERROR',
}

export interface IOperation {
  id: string;
  status: OperationStatus;
  event: IEvent<unknown>;
  createdAt: Date;
  finishedAt?: Date;
  result?: ResultValue<unknown>;
}
