import { Exception, Id, Result } from '@Architecture/Domain';
import { decided, Decision } from '@Architecture/Domain/Lite/Decision';

/**
 * A decision of the Lite profile (ADR 43): a pure function of the state, the command and the time, so
 * its spec is a state, a command, a time and an answer — no port, no double, no clock to move.
 */

interface Task {
  id: string;
  owner: string;
  completedAt?: Date;
}
type TaskCompleted = { type: 'TaskCompleted'; taskId: string };

class NotYourTaskException extends Exception {
  constructor() {
    super({ service: 'Tasks', type: 'NotYourTask', message: 'A task is completed by its owner' });
  }
}

const decideAddTask: Decision<Task, { owner: string }, never, undefined> = (_, { owner }) =>
  decided({ id: Id.generate().value, owner });

const decideCompleteTask: Decision<Task, { by: string }, TaskCompleted> = (task, { by }, now) =>
  task.owner !== by
    ? Result.fail(new NotYourTaskException())
    : decided({ ...task, completedAt: now }, { type: 'TaskCompleted', taskId: task.id });

const now = new Date('2026-11-13T09:00:00Z');
const task: Task = { id: 't1', owner: 'alice' };

describe('a Lite decision', () => {
  it('answers the new state and the facts it records, on the time it is given', () => {
    const answer = decideCompleteTask(task, { by: 'alice' }, now);

    expect(answer.isSuccess() && answer.data).toEqual({
      state: { id: 't1', owner: 'alice', completedAt: now },
      facts: [{ type: 'TaskCompleted', taskId: 't1' }],
    });
  });

  it('answers the rule’s refusal as a failed Result, and leaves the state it was given as it was', () => {
    const answer = decideCompleteTask(task, { by: 'bob' }, now);

    expect(answer.isFailure() && answer.error).toBeInstanceOf(NotYourTaskException);
    expect(task).toEqual({ id: 't1', owner: 'alice' });
  });

  it('gives the same answer to the same state, command and time', () => {
    expect(decideCompleteTask(task, { by: 'alice' }, now)).toEqual(decideCompleteTask(task, { by: 'alice' }, now));
  });

  it('brings a thing into existence from nothing, with the id the domain generates, and records no fact unless told', () => {
    const answer = decideAddTask(undefined, { owner: 'alice' }, now);

    expect(answer.isSuccess() && answer.data.facts).toEqual([]);
    expect(answer.isSuccess() && answer.data.state).toEqual({ id: expect.any(String), owner: 'alice' });
  });
});
