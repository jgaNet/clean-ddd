import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

/**
 * A small context held to the Lite profile (ADR 40), written into an application `create --profile lite`
 * made, so that the specs can hold the engine to what a Lite context really looks like: the inventory and
 * the storm read its use cases, the check holds its wiring, the triggers fire where they should. It is
 * real code — the files compile against the copied building blocks and pass the application's own checks
 * (the claim checked by hand, with an install) — and nobody's business: a list of tasks.
 *
 * - `AddTask` creates a task (`201 { id }`), `CompleteTask` completes one and tells other contexts
 *   (`TaskCompleted`, through the outbox), `ListMyTasks` reads them; all three answered at once, and all
 *   three for a signed-in caller, which the transport holds (ADR 43).
 * - Each command decides in a pure decision (`Task.decision.ts`, ADR 43): the use case loads the task,
 *   calls the decision with the clock's time, saves the state it answers and publishes its facts.
 */
export const LITE_TASKS: Record<string, string> = {
  'src/Contexts/Tasks/Domain/Task/TaskTitle.ts': `import { Exception, IResult, Result, ValueObject } from '@Architecture/Domain';

/** What a task is called: not blank, at most a line. */
export class TaskTitle extends ValueObject<string> {
  static readonly MAX_LENGTH = 120;

  static create(raw: string): IResult<TaskTitle> {
    const value = raw.trim();
    if (!value) return Result.fail(new BlankTaskTitleException());
    if (value.length > TaskTitle.MAX_LENGTH) return Result.fail(new TaskTitleTooLongException());
    return Result.ok(new TaskTitle(value));
  }
}

export class BlankTaskTitleException extends Exception {
  constructor() {
    super({ service: 'Tasks', type: 'BlankTaskTitle', message: 'A task has a title' });
  }
}

export class TaskTitleTooLongException extends Exception {
  constructor() {
    super({
      service: 'Tasks',
      type: 'TaskTitleTooLong',
      message: \`A title is at most \${TaskTitle.MAX_LENGTH} characters\`,
    });
  }
}
`,
  'src/Contexts/Tasks/Domain/Task/TaskExceptions.ts': `import { Exception, NotAllowedException, NotFoundException } from '@Architecture/Domain';

export class TaskNotFoundException extends NotFoundException {
  constructor(id: string) {
    super('Tasks', \`No task \${id}\`);
  }
}

export class NotYourTaskException extends NotAllowedException {
  constructor() {
    super('Tasks', 'A task is completed by its owner');
  }
}

export class TaskAlreadyCompletedException extends Exception {
  constructor() {
    super({ service: 'Tasks', type: 'TaskAlreadyCompleted', message: 'The task is already completed' });
  }
}
`,
  'src/Contexts/Tasks/Domain/Task/Task.ts': `/** A task, as its decisions read and answer it, and as its store keeps it. */
export interface Task {
  readonly id: string;
  readonly owner: string;
  readonly title: string;
  /** When its owner completed it; absent while it is open. */
  readonly completedAt?: Date;
}

/** What a task's decisions record: a fact another context reacts to (\`TaskCompletedIntegrationEvent\`). */
export interface TaskCompleted {
  readonly type: 'TaskCompleted';
  readonly taskId: string;
  readonly ownerId: string;
}
`,
  'src/Contexts/Tasks/Domain/Task/Task.decision.ts': `import { Id, Result } from '@Architecture/Domain';
import { decided, Decision } from '@Architecture/Domain/Lite/Decision';

import { Task, TaskCompleted } from '@Contexts/Tasks/Domain/Task/Task';
import { TaskTitle } from '@Contexts/Tasks/Domain/Task/TaskTitle';
import { NotYourTaskException, TaskAlreadyCompletedException } from '@Contexts/Tasks/Domain/Task/TaskExceptions';

/** A task is added by a signed-in owner, under a title that is not blank: from nothing, with its own id. */
export const decideAddTask: Decision<Task, { owner: string; title: string }, never, undefined> = (
  _,
  { owner, title },
) => {
  const checked = TaskTitle.create(title);
  if (checked.isFailure()) return checked;
  return decided({ id: Id.generate().value, owner, title: checked.data.value });
};

/** A task is completed by its owner, once, at the time it is given; other contexts are told. */
export const decideCompleteTask: Decision<Task, { by: string }, TaskCompleted> = (task, { by }, now) => {
  if (task.owner !== by) return Result.fail(new NotYourTaskException());
  if (task.completedAt) return Result.fail(new TaskAlreadyCompletedException());
  return decided({ ...task, completedAt: now }, { type: 'TaskCompleted', taskId: task.id, ownerId: task.owner });
};
`,
  'src/Contexts/Tasks/Domain/Task/Task.decision.spec.ts': `import { decideAddTask, decideCompleteTask } from '@Contexts/Tasks/Domain/Task/Task.decision';
import { BlankTaskTitleException } from '@Contexts/Tasks/Domain/Task/TaskTitle';
import { NotYourTaskException, TaskAlreadyCompletedException } from '@Contexts/Tasks/Domain/Task/TaskExceptions';

const now = new Date('2026-11-13T09:00:00Z');
const task = { id: 't1', owner: 'alice', title: 'Write the spec' };

describe('the decisions on a task: a state, a command, a time, an answer', () => {
  it('adds a task under a checked title, with an id of its own', () => {
    const answer = decideAddTask(undefined, { owner: 'alice', title: '  Write the spec ' }, now);
    expect(answer.isSuccess() && answer.data).toEqual({ state: { ...task, id: expect.any(String) }, facts: [] });
    expect(decideAddTask(undefined, { owner: 'alice', title: ' ' }, now).error).toBeInstanceOf(BlankTaskTitleException);
  });

  it('completes a task for its owner, once, and records the fact', () => {
    const answer = decideCompleteTask(task, { by: 'alice' }, now);
    expect(answer.isSuccess() && answer.data).toEqual({
      state: { ...task, completedAt: now },
      facts: [{ type: 'TaskCompleted', taskId: 't1', ownerId: 'alice' }],
    });
    expect(decideCompleteTask(task, { by: 'bob' }, now).error).toBeInstanceOf(NotYourTaskException);
    expect(decideCompleteTask({ ...task, completedAt: now }, { by: 'alice' }, now).error).toBeInstanceOf(
      TaskAlreadyCompletedException,
    );
  });
});
`,
  'src/Contexts/Tasks/Application/ITaskStore.ts': `import { Task } from '@Contexts/Tasks/Domain/Task/Task';

/** A task as a list shows it. */
export interface TaskListItem {
  id: string;
  title: string;
  completed: boolean;
}

/** Where the tasks are kept: the one port the use cases take, at the edge. */
export interface ITaskStore {
  get(id: string): Promise<Task | undefined>;
  put(task: Task): Promise<void>;
  /** The tasks of an owner, oldest first; none for an owner with none. */
  listByOwner(owner: string): Promise<TaskListItem[]>;
}
`,
  'src/Contexts/Tasks/Application/Tasks.ts': `import { IResult, Result } from '@Architecture/Domain';
import { Clock } from '@Architecture/Application';
import { callerOf, command, query } from '@Architecture/Application/Lite/UseCase';
import { publishIntegrationEvent } from '@Architecture/Application/DomainEvents';
import { TaskCompletedIntegrationEvent } from '@SharedKernel/Application/IntegrationEvents/TaskIntegrationEvents';

import { decideAddTask, decideCompleteTask } from '@Contexts/Tasks/Domain/Task/Task.decision';
import { TaskNotFoundException } from '@Contexts/Tasks/Domain/Task/TaskExceptions';
import { ITaskStore, TaskListItem } from '@Contexts/Tasks/Application/ITaskStore';

// Every use case here needs a signed-in caller, which the transport holds (no \`caller: 'anyone'\`).

export const addTask = command(
  'AddTask',
  (tasks: ITaskStore, clock: Clock) =>
    async ({ title }: { title: string }, context) => {
      const decision = decideAddTask(undefined, { owner: callerOf(context), title }, clock());
      if (decision.isFailure()) return decision;
      await tasks.put(decision.data.state);
      return Result.ok(decision.data.state.id);
    },
);

export const completeTask = command(
  'CompleteTask',
  (tasks: ITaskStore, clock: Clock) =>
    async ({ id }: { id: string }, context) => {
      const task = await tasks.get(id);
      if (!task) return Result.fail(new TaskNotFoundException(id));
      const decision = decideCompleteTask(task, { by: callerOf(context) }, clock());
      if (decision.isFailure()) return decision;
      await tasks.put(decision.data.state);
      for (const { taskId, ownerId } of decision.data.facts) {
        await publishIntegrationEvent(TaskCompletedIntegrationEvent.set({ taskId, ownerId }), context);
      }
      return Result.ok(undefined);
    },
);

export const listMyTasks = query(
  'ListMyTasks',
  (tasks: ITaskStore) =>
    async (_: undefined, context): Promise<IResult<TaskListItem[]>> =>
      Result.ok(await tasks.listByOwner(callerOf(context))),
);
`,
  'src/Contexts/Tasks/Infrastructure/InMemoryTaskStore.ts': `import { InMemoryDataSource } from '@Architecture/Infrastructure/DataSources/InMemoryDataSource';

import { Task } from '@Contexts/Tasks/Domain/Task/Task';
import { ITaskStore, TaskListItem } from '@Contexts/Tasks/Application/ITaskStore';

export class InMemoryTaskStore implements ITaskStore {
  constructor(private readonly dataSource: InMemoryDataSource<Task>) {}

  async get(id: string): Promise<Task | undefined> {
    return this.dataSource.collection.get(id);
  }

  async put(task: Task): Promise<void> {
    this.dataSource.collection.set(task.id, task);
  }

  async listByOwner(owner: string): Promise<TaskListItem[]> {
    return [...this.dataSource.collection.values()]
      .filter(task => task.owner === owner)
      .map(({ id, title, completedAt }) => ({ id, title, completed: completedAt !== undefined }));
  }
}
`,
  'src/Contexts/Tasks/Presentation/task.routes.ts': `import { FastifyPluginCallback } from 'fastify';

import { LiteModule } from '@Architecture/Application/Lite/LiteModule';
import { answerAtOnce } from '@Architecture/Presentation/Lite/AnswerAtOnce';

import { addTask, completeTask, listMyTasks } from '@Contexts/Tasks/Application/Tasks';

export const taskRoutes: FastifyPluginCallback<{ module: LiteModule }> = (fastify, { module }, done) => {
  fastify.post<{ Body: { title: string } }>(
    '/',
    { schema: { body: { type: 'object', required: ['title'], properties: { title: { type: 'string' } } } } },
    (req, reply) => answerAtOnce(req, reply, module.useCase(addTask), { title: req.body.title }, { created: true }),
  );
  fastify.post<{ Params: { id: string } }>('/:id/complete', (req, reply) =>
    answerAtOnce(req, reply, module.useCase(completeTask), { id: req.params.id }),
  );
  fastify.get('/', (req, reply) => answerAtOnce(req, reply, module.useCase(listMyTasks), undefined));
  done();
};
`,
  'src/Contexts/Tasks/Presentation/task.routes.e2e.spec.ts': `import { FastifyApplication } from '@Bootstrap/Fastify/FastifyApplication';
import { createApplication } from '@Bootstrap/Fastify/createApplication';

let app: FastifyApplication;
let api: string;
beforeAll(async () => {
  app = await createApplication();
  await app.start(0);
  api = \`\${app.address}/\${app.apiPrefix}\`;
});
afterAll(() => app.stop());

describe('the tasks, answered at once', () => {
  it('refuses a caller who is not signed in at once, with 401 and the rule', async () => {
    const response = await fetch(\`\${api}/tasks\`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Write the spec' }),
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ type: 'NotAllowed', message: 'Authentication required' });
  });

  it('refuses a body of the wrong shape with 400, from the schema', async () => {
    const response = await fetch(\`\${api}/tasks\`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(response.status).toBe(400);
  });
});
`,
  'src/Contexts/Tasks/module.local.ts': `import { LiteModule } from '@Architecture/Application/Lite/LiteModule';
import { systemClock } from '@Architecture/Infrastructure/Clock/SystemClock';
import { InMemoryDataSource } from '@Architecture/Infrastructure/DataSources/InMemoryDataSource';

import { Task } from '@Contexts/Tasks/Domain/Task/Task';
import { addTask, completeTask, listMyTasks } from '@Contexts/Tasks/Application/Tasks';
import { InMemoryTaskStore } from '@Contexts/Tasks/Infrastructure/InMemoryTaskStore';

const taskStore = new InMemoryTaskStore(new InMemoryDataSource<Task>());

export const localTasksModule = new LiteModule({
  name: 'Tasks',
  useCases: [addTask(taskStore, systemClock), completeTask(taskStore, systemClock), listMyTasks(taskStore)],
});
`,
  'src/SharedKernel/Application/IntegrationEvents/TaskIntegrationEvents.ts': `import { IntegrationEvent } from '@Architecture/Domain';

/** A task was completed by its owner: what another context may react to. */
export class TaskCompletedIntegrationEvent extends IntegrationEvent<{ taskId: string; ownerId: string }> {}
`,
};

/**
 * Writes the Tasks context into an application created Lite: its files, its declaration in the binding
 * (held to Lite by the binding's `default_profile`), its description in the domain map, the fact it publishes
 * in the published language, and its module and routes in the composition root.
 */
export function addLiteTasks(directory: string): void {
  for (const [path, text] of Object.entries(LITE_TASKS)) {
    mkdirSync(dirname(join(directory, path)), { recursive: true });
    writeFileSync(join(directory, path), text);
  }
  const edit = (path: string, change: (text: string) => string) =>
    writeFileSync(join(directory, path), change(readFileSync(join(directory, path), 'utf8')));
  edit('conventions/typescript.yaml', text => text.replace(/\ncontexts: \[\]\n/, '\ncontexts:\n  - Tasks\n'));
  edit('conventions/domain.yaml', text =>
    text
      .replace(
        /\nsubdomains: \[\]\n/,
        '\nsubdomains:\n  - { id: tasks, name: Tasks, kind: supporting, why: what each person has to do, contexts: [Tasks] }\n',
      )
      .replace(
        /\ncontexts: \[\]\n/,
        '\ncontexts:\n  - { id: Tasks, purpose: what each person has to do, language: [] }\n',
      ),
  );
  // The fact it tells other contexts, declared in the published language before the code publishes it (ADR 44).
  edit('conventions/integration-events.yaml', text =>
    text.replace(
      /\nevents: \{\}\n/,
      [
        '',
        'events:',
        '  TaskCompleted:',
        '    publisher: Tasks',
        '    versions:',
        '      - version: 1',
        '        payload: { taskId: string, ownerId: string }',
        '',
      ].join('\n'),
    ),
  );
  edit('src/Bootstrap/Fastify/createApplication.ts', text =>
    text
      .replace(
        "import { FastifyApplication } from '@Bootstrap/Fastify/FastifyApplication';",
        "import { localTasksModule } from '@Contexts/Tasks/module.local';\nimport { taskRoutes } from '@Contexts/Tasks/Presentation/task.routes';\n\nimport { FastifyApplication } from '@Bootstrap/Fastify/FastifyApplication';",
      )
      .replace(
        /(\n {4}new InMemoryEventBus\(\{[^\n]*\}\),\n {2}\))/,
        "$1\n    .registerModule(localTasksModule)\n    .registerRoutes('/tasks', taskRoutes, { module: localTasksModule })",
      ),
  );
}
