import { IResult, Result } from '@Architecture/Domain';

/**
 * A decision of the Lite profile (ADR 43, after RFC 0005's P1: a functional core in an imperative
 * shell): where a command's rules live. It is a pure function of the state it is given, the command
 * and the time (`now`, given by the use case from the one clock the wiring passes, DOMAIN-ONE-CLOCK).
 * It answers the new state and the facts it records, or the rule's refusal as a failed Result
 * (DOMAIN-RESULT).
 *
 * The use case is the shell around it: it loads what the decision needs through its ports, calls it,
 * saves the state it answers and publishes its facts — what another context reacts to, as an integration
 * event through the outbox (EVENT-AFTER-COMMIT). The decision imports no port, does no I/O, is not
 * `async` and reads no clock, so its spec needs no double: a state, a command, a time, an answer.
 *
 * A decision lives in a `*.decision.ts` file in the Domain layer, beside the thing it decides
 * (`Domain/Task/Task.decision.ts`), one export per command, named `decide<Intent>`; the linter holds
 * what such a file may not do.
 *
 * ```typescript
 * export const decideCompleteTask: Decision<Task, { by: string }, TaskCompleted> = (task, { by }, now) => {
 *   if (task.owner !== by) return Result.fail(new NotYourTaskException());
 *   if (task.completedAt) return Result.fail(new TaskAlreadyCompletedException());
 *   return decided({ ...task, completedAt: now }, { type: 'TaskCompleted', taskId: task.id, ownerId: task.owner });
 * };
 * ```
 *
 * A decision that brings a thing into existence is given nothing (`Given = undefined`) and generates the
 * thing's id (`Id.generate()`): identity is the domain's to generate (DOMAIN-IDENTITY), and it is the one
 * value a decision makes that is not a function of what it is given — its spec reads it from the answer.
 * A fact is a plain value of the context's Domain (`{ type: 'TaskCompleted', … }`); recording one is
 * worth it only where something reacts to it, and the use case turns it into the contract the other
 * context reads.
 */
export type Decision<State, Command, Fact = never, Given = State> = (
  given: Given,
  command: Command,
  now: Date,
) => IResult<Decided<State, Fact>>;

/** What a decision answers when it allows the command: the state to save, and the facts it records. */
export interface Decided<State, Fact = never> {
  readonly state: State;
  readonly facts: readonly Fact[];
}

/** The answer of a decision that allows the command: the new state, and the facts it records, if any. */
export function decided<State, Fact = never>(state: State, ...facts: Fact[]): IResult<Decided<State, Fact>> {
  return Result.ok({ state, facts });
}
