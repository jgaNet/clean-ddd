import { OperationStatus } from '@Architecture/Application';

/**
 * Tracker has no aggregate. It is a projection: every operation the event bus carries is
 * recorded as one of these, so a client that received `202 { operationId }` can come back
 * and ask how it went. A read model, shaped for that question and nothing else.
 */
export interface OperationRecord {
  id: string;
  /** The public name of the command or event, e.g. "CreateNote": its intent, without the suffix of its kind. */
  name: string;
  status: OperationStatus;
  traceId: string;
  /** The account that asked, when the request was authenticated. */
  subjectId?: string;
  // No payload: a command may carry a secret (the password at sign-up), and a client who
  // holds the operation id already knows what it asked for. Status, result and error are
  // what the record is for.
  /** What the handler returned on success. */
  result?: unknown;
  error?: { type: string; message: string };
  createdAt: Date;
  finishedAt?: Date;
}
