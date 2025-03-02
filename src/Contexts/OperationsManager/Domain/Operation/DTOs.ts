import { IResult, Event, EventBus } from '@Primitives';

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
  eventBus: EventBus;
  event: T;
}
