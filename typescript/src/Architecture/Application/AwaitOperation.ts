/**
 * awaitOperation: waits for an operation's outcome, for at most a deadline.
 *
 * A command is answered `202 { operationId }` and followed at the Tracker: that is the
 * contract's grammar, and nothing here changes it. A transport that must answer in one exchange
 * needs the outcome before it answers: the compatibility route of a migrated application, which
 * serves the wire the application's clients already speak while they move to the contract's
 * (ADR 35). It publishes the command as any controller does, then waits here.
 *
 * The wait is on the operation's `delivered`: the promise the outbox's relay acknowledges on,
 * which settles once every subscriber the message reached has finished with it. A command has
 * one subscriber, its handler (ARCH-ONE-HANDLER), so when it settles the operation carries the
 * handler's verdict — SUCCESS with the result, ERROR with the refusal — and a tracking bus has
 * recorded it: the operation the caller reads is the one a client would read at
 * `GET /tracker/operations/:id`.
 *
 * The deadline is a parameter with a default. Past it the operation is returned as it is, still
 * PENDING: the caller answers what the contract answers, the 202 and the id, and the client
 * follows the operation like any other. Nothing is cancelled: the handler finishes and the
 * Tracker records it. A bus that cannot tell when a message was delivered (no `delivered`) is
 * answered the same way, at once. So is a command nobody answers (a handler missing from the
 * wiring, which the conventions check refuses): delivered to no one, it stays PENDING.
 *
 * It is a mechanic, not a rule: it knows no vocabulary, decides nothing, and a controller inside
 * a context has no use for it — a command's route answers 202, and only a compatibility route in
 * the transport waits.
 */

import { IEvent } from '@Architecture/Domain';
import { IOperation, OperationStatus } from '@Architecture/Application/Operation';

/** How long a caller that must answer in one exchange waits for a command's outcome, by default. */
export const DEFAULT_OUTCOME_TIMEOUT_MS = 5_000;

/** Whether the operation has reached its outcome: its handler decided it, one way or the other. */
export function hasOutcome(operation: IOperation<IEvent<unknown>>): boolean {
  return operation.status === OperationStatus.SUCCESS || operation.status === OperationStatus.ERROR;
}

/**
 * Resolves with the operation once its handler has decided it, or once `timeoutMs` has passed,
 * whichever comes first; the status says which. The operation is the same object the bus handed
 * out: a handler that finishes after the deadline still fills it in.
 */
export async function awaitOperation<T extends IEvent<unknown>>(
  operation: IOperation<T>,
  { timeoutMs = DEFAULT_OUTCOME_TIMEOUT_MS }: { timeoutMs?: number } = {},
): Promise<IOperation<T>> {
  if (hasOutcome(operation) || !operation.delivered) return operation;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<void>(resolve => {
    timer = setTimeout(resolve, timeoutMs);
  });
  try {
    await Promise.race([operation.delivered, deadline]);
  } finally {
    clearTimeout(timer);
  }
  return operation;
}
