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
  /**
   * Settles once every subscriber the message reached has finished with it: true when each one
   * succeeded (or had handled it before), false when one failed. The outbox's relay acknowledges
   * an entry on it, never sooner (ADR 24): a fact whose reactions have not committed is still
   * owed. A bus that cannot tell leaves it undefined, and the relay acknowledges at once.
   */
  delivered?: Promise<boolean>;
}
