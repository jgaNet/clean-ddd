import { IEvent, IResult } from '@SharedKernel/Domain';
// eslint-disable-next-line no-restricted-imports -- pre-existing: Tracker models the event bus's own operations; to be reframed as a read-model projection
import { ExecutionContext, OperationStatus, IOperation } from '@SharedKernel/Application';

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
