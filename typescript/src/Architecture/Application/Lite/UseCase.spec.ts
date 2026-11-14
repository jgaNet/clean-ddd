import { expect, jest } from '@jest/globals';

import { ConcurrencyConflictException, Id, IntegrationEvent, NotAllowedException, Result } from '@Architecture/Domain';
import { EventBus, ExecutionContext, publishIntegrationEvent } from '@Architecture/Application';
import { callerOf, command, CONFLICT_ATTEMPTS, query } from '@Architecture/Application/Lite/UseCase';
import { InMemoryDataSource } from '@Architecture/Infrastructure/DataSources/InMemoryDataSource';
import { InMemoryOutbox } from '@Architecture/Infrastructure/Outbox/InMemoryOutbox';
import { InMemoryUnitOfWork } from '@Architecture/Infrastructure/UnitOfWork/InMemoryUnitOfWork';

/**
 * A use case of the Lite profile (ADR 40): a function of its ports, run by the building block in the
 * request's transaction. What it tells other contexts is durable with what it wrote and published after
 * the commit (EVENT-AFTER-COMMIT), a refusal is a value and undoes everything (DOMAIN-RESULT), a
 * conflict is re-decided from a fresh read (CONC-OPTIMISTIC), and a query opens no transaction.
 */

class TaskAddedIntegrationEvent extends IntegrationEvent<{ taskId: string }> {}

/** The store a use case is a function of: a port at the edge, here a plain in-memory one. */
type Tasks = InMemoryDataSource<{ id: string; title: string }>;

const addTask = command('AddTask', (tasks: Tasks) => async ({ title }: { title: string }, context) => {
  if (!title.trim()) return Result.fail(new NotAllowedException('Tasks', 'A task has a title'));
  const id = Id.generate().value;
  tasks.collection.set(id, { id, title });
  await publishIntegrationEvent(TaskAddedIntegrationEvent.set({ taskId: id }), context);
  return Result.ok(id);
});

const listTasks = query(
  'ListTasks',
  (tasks: Tasks) => async (_: undefined) => Result.ok([...tasks.collection.values()].map(({ title }) => title)),
);

const eventBus = { connect: jest.fn(), publish: jest.fn(), subscribe: jest.fn() } as EventBus;
const published = () => jest.mocked(eventBus.publish).mock.calls.map(([event]) => event);

let tasks: Tasks;
let outbox: InMemoryOutbox;
let unitOfWork: InMemoryUnitOfWork;
const context = () =>
  new ExecutionContext({ traceId: 'trace', eventBus, unitOfWork, auth: { subjectId: 'alice', role: 'USER' } });

beforeEach(() => {
  jest.resetAllMocks();
  tasks = new InMemoryDataSource();
  outbox = new InMemoryOutbox();
  unitOfWork = new InMemoryUnitOfWork([tasks as InMemoryDataSource<unknown>, outbox.store], outbox);
});

describe('a Lite use case', () => {
  it('is defined once by its public name and built with its ports by the wiring', () => {
    const built = addTask(tasks);
    expect([addTask.useCaseName, addTask.kind]).toEqual(['AddTask', 'command']);
    expect([built.name, built.kind, built.definition]).toEqual(['AddTask', 'command', addTask]);
    expect(listTasks(tasks).kind).toBe('query');
  });

  it('says once who may call it: a signed-in caller unless its definition says anyone (ADR 43)', () => {
    const signUp = command('SignUp', () => async () => Result.ok(), { caller: 'anyone' });
    expect([addTask.whoMayCall, addTask(tasks).whoMayCall, listTasks(tasks).whoMayCall]).toEqual([
      'signed-in',
      'signed-in',
      'signed-in',
    ]);
    expect([signUp.whoMayCall, signUp().whoMayCall]).toEqual(['anyone', 'anyone']);
    expect(callerOf(context())).toBe('alice');
    expect(callerOf(new ExecutionContext({ traceId: 'trace', eventBus, unitOfWork, auth: {} }))).toBe('');
  });

  it('runs a command in the transaction, and publishes what it told other contexts after the commit, from the outbox', async () => {
    const result = await addTask(tasks).run({ title: 'Write the spec' }, context());

    expect(result.isSuccess()).toBe(true);
    expect([...tasks.collection.keys()]).toEqual([result.data]);
    expect(published()).toEqual([TaskAddedIntegrationEvent.set({ taskId: result.data as string })]);
    expect(await outbox.pending()).toEqual([]);
  });

  it('answers a refusal as a value, and keeps nothing of what it wrote nor of what it would have told', async () => {
    const refusing = command('AddTwice', (store: Tasks) => async (_: undefined, ctx) => {
      store.collection.set('first', { id: 'first', title: 'kept?' });
      await publishIntegrationEvent(TaskAddedIntegrationEvent.set({ taskId: 'first' }), ctx);
      return Result.fail(new NotAllowedException('Tasks', 'No'));
    });

    const result = await refusing(tasks).run(undefined, context());

    expect(result.isFailure() && result.error).toBeInstanceOf(NotAllowedException);
    expect(tasks.collection.size).toBe(0);
    expect(eventBus.publish).not.toHaveBeenCalled();
    expect(await outbox.pending()).toEqual([]);
  });

  it('turns a throw into a failed Result and rolls back', async () => {
    const throwing = command('Explode', (store: Tasks) => async () => {
      store.collection.set('half', { id: 'half', title: 'half-written' });
      throw new Error('a programming error');
    });

    const result = await throwing(tasks).run(undefined, context());

    expect(result.isFailure()).toBe(true);
    expect(tasks.collection.size).toBe(0);
  });

  it('re-decides a command from a fresh read on a conflict, and answers the last conflict as the refusal', async () => {
    let runs = 0;
    const racing = (wins: number) =>
      command('Race', () => async () => {
        runs += 1;
        return runs < wins ? Result.fail(new ConcurrencyConflictException('Tasks', 'changed')) : Result.ok('won');
      })();

    expect((await racing(2).run(undefined, context())).data).toBe('won');
    expect(runs).toBe(2);

    runs = 0;
    const lost = await racing(CONFLICT_ATTEMPTS + 1).run(undefined, context());
    expect(lost.isFailure() && lost.error).toBeInstanceOf(ConcurrencyConflictException);
    expect(runs).toBe(CONFLICT_ATTEMPTS);
  });

  it('reads a query without opening a transaction', async () => {
    tasks.collection.set('t', { id: 't', title: 'Read me' });
    const begin = jest.spyOn(unitOfWork, 'beginTransaction');

    const result = await listTasks(tasks).run(undefined, context());

    expect(result.data).toEqual(['Read me']);
    expect(begin).not.toHaveBeenCalled();
  });
});
