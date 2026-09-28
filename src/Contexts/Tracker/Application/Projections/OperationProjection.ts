import { Event } from '@SharedKernel/Domain';
import { IOperation } from '@SharedKernel/Application';

import { OperationRecord } from '@Contexts/Tracker/Application/ReadModel/OperationRecord';

/**
 * The projection itself: from what the bus knows about an operation to what a client may
 * see. It keeps the trace and the caller, drops the execution context (logger, bus, unit of
 * work have no place in a read model) and flattens the Result into `result` / `error`.
 */
export function toOperationRecord(operation: IOperation<Event<unknown>>): OperationRecord {
  const { result } = operation;

  return {
    id: operation.id,
    name: operation.event.name,
    status: operation.status,
    traceId: operation.context.traceId,
    subjectId: operation.context.auth.subjectId || undefined,
    payload: operation.event.payload,
    result: result?.isSuccess() ? result.data : undefined,
    error: result?.isFailure() ? { type: result.error.type, message: result.error.message } : undefined,
    createdAt: operation.createdAt,
    finishedAt: operation.finishedAt,
  };
}
