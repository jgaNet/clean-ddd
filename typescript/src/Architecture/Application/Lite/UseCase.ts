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
 * Who is calling is the use case's first question, as in Full: `requireSignedIn(context, '<Context>')`
 * at the top, its refusal answered at once with 401 (API-CALLER-AT-TRANSPORT: a command answered at
 * once keeps its own 4xx). A query never opens a transaction: it reads.
 *
 * ```typescript
 * export const addTask = command('AddTask', (tasks: ITaskStore) => async ({ title }: { title: string }, context) => {
 *   const caller = requireSignedIn(context, 'Tasks');
 *   if (caller.isFailure()) return caller;
 *   const checked = TaskTitle.create(title);
 *   if (checked.isFailure()) return checked;
 *   const id = Id.generate();
 *   await tasks.add({ id: id.value, owner: caller.data.value, title: checked.data.value });
 *   return Result.ok(id.value);
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

/** A use case built with its ports: what the Module lists and the route calls. */
export interface UseCase<Input, Output> {
  /** The public name: the intent of a command (`AddTask`), the question of a query (`ListTasks`). */
  readonly name: string;
  readonly kind: UseCaseKind;
  /** The definition it was built from: how a route finds, in the Module, the one the wiring built. */
  readonly definition: object;
  run(input: Input, context: ExecutionContext): Promise<IResult<Output>>;
}

/** A use case before its ports: `addTask`, which the wiring calls with its store (`addTask(taskStore)`). */
export interface UseCaseDefinition<Ports extends unknown[], Input, Output> {
  (...ports: Ports): UseCase<Input, Output>;
  readonly useCaseName: string;
  readonly kind: UseCaseKind;
}

/** How many times a command runs on a concurrency conflict before the conflict is the answer (ADR 25). */
export const CONFLICT_ATTEMPTS = 3;

/** A use case that changes state: run in the request's transaction, retried on a conflict. */
export function command<Ports extends unknown[], Input, Output>(
  name: string,
  build: (...ports: Ports) => Run<Input, Output>,
): UseCaseDefinition<Ports, Input, Output> {
  return define('command', name, build);
}

/** A use case that reads: returns a read model, never an aggregate (QUERY-READ-MODELS), and changes nothing. */
export function query<Ports extends unknown[], Input, Output>(
  name: string,
  build: (...ports: Ports) => Run<Input, Output>,
): UseCaseDefinition<Ports, Input, Output> {
  return define('query', name, build);
}

function define<Ports extends unknown[], Input, Output>(
  kind: UseCaseKind,
  name: string,
  build: (...ports: Ports) => Run<Input, Output>,
): UseCaseDefinition<Ports, Input, Output> {
  const definition = Object.assign(
    (...ports: Ports): UseCase<Input, Output> => {
      const run = build(...ports);
      return {
        name,
        kind,
        definition,
        run: (input, context) =>
          kind === 'command' ? runCommand(name, run, input, context) : runQuery(name, run, input, context),
      };
    },
    { useCaseName: name, kind },
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
