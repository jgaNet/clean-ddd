import { OperationStatus } from '@SharedKernel/Application';

/**
 * Tracker has no aggregate. It is a projection: every operation the event bus carries is
 * recorded as one of these, so a client that received `202 { operationId }` can come back
 * and ask how it went. A read model, shaped for that question and nothing else.
 */
export interface OperationRecord {
  id: string;
  /** The command or event name, e.g. "CreateNoteCommandEvent". */
  name: string;
  status: OperationStatus;
  traceId: string;
  /** The account that asked, when the request was authenticated. */
  subjectId?: string;
  payload: unknown;
  /** What the handler returned on success. */
  result?: unknown;
  error?: { type: string; message: string };
  createdAt: Date;
  finishedAt?: Date;
}
