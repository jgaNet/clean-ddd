import { IEvent, ExecutionContext, IResult } from '@Primitives';
import { OperationStatus, IOperation } from '@Primitives';

export type ITrackedOperationDTO = Omit<ITrackedOperation<IEvent<unknown>>, 'success' | 'failed' | 'sent'>;

export interface ITrackedOperation<T extends IEvent<unknown> = IEvent<unknown>> extends IOperation<T> {
  id: string;
  status: OperationStatus;
  event: T;
  createdAt: Date;
  finishedAt?: Date;
  result?: IResult<unknown>;
  context: ExecutionContext;
}
