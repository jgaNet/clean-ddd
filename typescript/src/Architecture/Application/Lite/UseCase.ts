/**
 * A use case of the Lite profile (ADR 40): a function of its ports, named for its intent, listed in
 * its context's Module and called by the route, which answers its result at once. No command bus, no
 * `CommandEvent` class, no handler class, no `202`: what Full spreads over those, one function says.
 *
 * What every use case needs is done once, here, as `CommandHandler` does it for Full:
 *
 * 1. transaction - a command runs in the request's unit of work: a failed Result or a throw rolls it
 *                  back, and what it told other contexts (`publishIntegrationEvent()`) goes to the
 *                  outbox at commit and is published after it (ADR 24) — never before, never on a refusal
 * 2. safety net  - an unexpected throw becomes a failed Result instead of a crash (DOMAIN-RESULT)
 * 3. retry       - a concurrency conflict is re-read and re-decided in a new transaction, up to
 *                  CONFLICT_ATTEMPTS times; the last conflict is the refusal (ADR 25), for the day a
 *                  thing has two writers and its store checks a version (several-writers)
 * 4. logging     - what ran, and whether it was refused
 *
 * Who may call it is said once, where it is defined, and held by the transport (API-CALLER-AT-TRANSPORT,
 * ADR 43, as `anyoneMayAsk()` says it of a handler in Full): a use case needs a signed-in caller, and the
 * route's helper (`answerAtOnce()`) refuses a missing one at once with 401 before the use case runs,
 * unless the definition says `{ caller: 'anyone' }` (signing up, a link that carries its own proof). The
 * building blocks know no role, so these two words are all a use case says here: "administrators only"
 * is a rule the use case asks through the shared kernel, answered with its own 4xx. A use case that
 * needs the caller's id reads it with `callerOf(context)`.
 *
 * A command decides in a decision (ADR 43): it loads what it needs through its ports, calls a pure
 * function of the state, the command and the time (`Decision`, in the building blocks' Domain), saves
 * the state the decision answers and publishes its facts. The use case is the shell; the rules are in
 * the decision. A query never opens a transaction: it reads.
 *
 * ```typescript
 * export const completeTask = command('CompleteTask', (tasks: ITaskStore, clock: Clock) => async ({ id }: { id: string }, context) => {
 *   const task = await tasks.get(id);
 *   if (!task) return Result.fail(new TaskNotFoundException(id));
 *   const decision = decideCompleteTask(task, { by: callerOf(context) }, clock());
 *   if (decision.isFailure()) return decision;
 *   await tasks.put(decision.data.state);
 *   for (const { taskId, ownerId } of decision.data.facts) {
 *     await publishIntegrationEvent(TaskCompletedIntegrationEvent.set({ taskId, ownerId }), context);
 *   }
 *   return Result.ok(undefined);
 * });
 * ```
 *
 * The name is the public one (`AddTask`, never `AddTaskCommand`): the API, the logs and the inventory
 * say it (API-ONE-SURFACE). The wiring builds it with its ports (`addTask(taskStore)`) and lists it in
 * a `LiteModule`; a route finds that one by its definition (`module.useCase(addTask)`).
 */

import { ConcurrencyConflictException, IResult, Result } from '@Architecture/Domain';
import { ExecutionContext } from '@Architecture/Application/ExecutionContext';

/** What a use case does with its input, in the request's context. */
export type Run<Input, Output> = (input: Input, context: ExecutionContext) => Promise<IResult<Output>>;

export type UseCaseKind = 'command' | 'query';

/**
 * Who may call a use case, said once where it is defined: a signed-in caller (the default), or anyone.
 * The transport holds it (`answerAtOnce()`); no role is named here, since the building blocks know none.
 */
export type Caller = 'signed-in' | 'anyone';

/** What a definition may say besides its name and its ports. */
export interface UseCaseOptions {
  /** `anyone` for a use case a caller who is not signed in may ask for; a signed-in caller otherwise. */
  caller?: Caller;
}

/** A use case built with its ports: what the Module lists and the route calls. */
export interface UseCase<Input, Output> {
  /** The public name: the intent of a command (`AddTask`), the question of a query (`ListTasks`). */
  readonly name: string;
  readonly kind: UseCaseKind;
  /** Who may call it: the transport refuses a missing caller with 401 when it is `signed-in`. */
  readonly whoMayCall: Caller;
  /** The definition it was built from: how a route finds, in the Module, the one the wiring built. */
  readonly definition: object;
  run(input: Input, context: ExecutionContext): Promise<IResult<Output>>;
}

/** A use case before its ports: `addTask`, which the wiring calls with its store (`addTask(taskStore)`). */
export interface UseCaseDefinition<Ports extends unknown[], Input, Output> {
  (...ports: Ports): UseCase<Input, Output>;
  readonly useCaseName: string;
  readonly kind: UseCaseKind;
  /** (Not `caller`: a function's own `caller` is not its to set.) */
  readonly whoMayCall: Caller;
}

/** How many times a command runs on a concurrency conflict before the conflict is the answer (ADR 25). */
export const CONFLICT_ATTEMPTS = 3;

/** A use case that changes state: run in the request's transaction, retried on a conflict. */
export function command<Ports extends unknown[], Input, Output>(
  name: string,
  build: (...ports: Ports) => Run<Input, Output>,
  options: UseCaseOptions = {},
): UseCaseDefinition<Ports, Input, Output> {
  return define('command', name, build, options);
}

/** A use case that reads: returns a read model, never an aggregate (QUERY-READ-MODELS), and changes nothing. */
export function query<Ports extends unknown[], Input, Output>(
  name: string,
  build: (...ports: Ports) => Run<Input, Output>,
  options: UseCaseOptions = {},
): UseCaseDefinition<Ports, Input, Output> {
  return define('query', name, build, options);
}

/**
 * The id of the caller, for a use case that needs it (an owner, an author). The transport has already
 * refused a signed-in use case's missing caller; for one anyone may call, it is `''` when nobody is.
 */
export const callerOf = (context: ExecutionContext): string => context.auth.subjectId ?? '';

function define<Ports extends unknown[], Input, Output>(
  kind: UseCaseKind,
  name: string,
  build: (...ports: Ports) => Run<Input, Output>,
  { caller = 'signed-in' }: UseCaseOptions,
): UseCaseDefinition<Ports, Input, Output> {
  const definition = Object.assign(
    (...ports: Ports): UseCase<Input, Output> => {
      const run = build(...ports);
      return {
        name,
        kind,
        whoMayCall: caller,
        definition,
        run: (input, context) =>
          kind === 'command' ? runCommand(name, run, input, context) : runQuery(name, run, input, context),
      };
    },
    { useCaseName: name, kind, whoMayCall: caller },
  );
  return definition;
}

async function runCommand<Input, Output>(
  name: string,
  run: Run<Input, Output>,
  input: Input,
  context: ExecutionContext,
): Promise<IResult<Output>> {
  context.logger?.info(`Executing ${name}`, { traceId: context.traceId });
  for (let attempt = 1; ; attempt++) {
    const result = await context.withTransaction(() => safely(name, run, input, context));
    const conflict = result.isFailure() && result.error instanceof ConcurrencyConflictException;
    if (conflict && attempt < CONFLICT_ATTEMPTS) {
      context.logger?.info(`${name} lost a race (attempt ${attempt} of ${CONFLICT_ATTEMPTS}); reading again`, {
        traceId: context.traceId,
      });
      continue;
    }
    if (result.isFailure()) {
      context.logger?.warn(`${name} refused: ${messageOf(result.error)}`, { traceId: context.traceId });
    }
    return result;
  }
}

async function runQuery<Input, Output>(
  name: string,
  run: Run<Input, Output>,
  input: Input,
  context: ExecutionContext,
): Promise<IResult<Output>> {
  return safely(name, run, input, context);
}

async function safely<Input, Output>(
  name: string,
  run: Run<Input, Output>,
  input: Input,
  context: ExecutionContext,
): Promise<IResult<Output>> {
  try {
    return await run(input, context);
  } catch (error) {
    context.logger?.error(`Unexpected error in ${name}`, error, { traceId: context.traceId });
    return Result.fail(error);
  }
}

const messageOf = (error: unknown): string =>
  typeof error === 'object' && error !== null && 'message' in error ? String(error.message) : String(error);
