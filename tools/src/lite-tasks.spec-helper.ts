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
 *   (`TaskCompleted`, through the outbox), `ListMyTasks` reads them; all three answered at once.
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
    super({ service: 'Tasks', type: 'TaskTitleTooLong', message: \`A title is at most \${TaskTitle.MAX_LENGTH} characters\` });
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
  'src/Contexts/Tasks/Application/ITaskStore.ts': `/** A task as the store keeps it. */
export interface TaskRecord {
  id: string;
  owner: string;
  title: string;
  completed: boolean;
}

/** A task as a list shows it. */
export interface TaskListItem {
  id: string;
  title: string;
  completed: boolean;
}

/** Where the tasks are kept: the one port the use cases take, at the edge. */
export interface ITaskStore {
  get(id: string): Promise<TaskRecord | undefined>;
  put(task: TaskRecord): Promise<void>;
  /** The tasks of an owner, oldest first; none for an owner with none. */
  listByOwner(owner: string): Promise<TaskListItem[]>;
}
`,
  'src/Contexts/Tasks/Application/Tasks.ts': `import { Id, IResult, Result } from '@Architecture/Domain';
import { command, query } from '@Architecture/Application/Lite/UseCase';
import { publishIntegrationEvent } from '@Architecture/Application/DomainEvents';
import { requireSignedIn } from '@SharedKernel/Application/Guards';
import { TaskCompletedIntegrationEvent } from '@SharedKernel/Application/IntegrationEvents/TaskIntegrationEvents';

import { TaskTitle } from '@Contexts/Tasks/Domain/Task/TaskTitle';
import {
  NotYourTaskException,
  TaskAlreadyCompletedException,
  TaskNotFoundException,
} from '@Contexts/Tasks/Domain/Task/TaskExceptions';
import { ITaskStore, TaskListItem } from '@Contexts/Tasks/Application/ITaskStore';

export const addTask = command('AddTask', (tasks: ITaskStore) => async ({ title }: { title: string }, context) => {
  const caller = requireSignedIn(context, 'Tasks');
  if (caller.isFailure()) return caller;
  const checked = TaskTitle.create(title);
  if (checked.isFailure()) return checked;
  const id = Id.generate().value;
  await tasks.put({ id, owner: caller.data.value, title: checked.data.value, completed: false });
  return Result.ok(id);
});

export const completeTask = command('CompleteTask', (tasks: ITaskStore) => async ({ id }: { id: string }, context) => {
  const caller = requireSignedIn(context, 'Tasks');
  if (caller.isFailure()) return caller;
  const task = await tasks.get(id);
  if (!task) return Result.fail(new TaskNotFoundException(id));
  if (task.owner !== caller.data.value) return Result.fail(new NotYourTaskException());
  if (task.completed) return Result.fail(new TaskAlreadyCompletedException());
  await tasks.put({ ...task, completed: true });
  await publishIntegrationEvent(TaskCompletedIntegrationEvent.set({ taskId: id, ownerId: task.owner }), context);
  return Result.ok(undefined);
});

export const listMyTasks = query(
  'ListMyTasks',
  (tasks: ITaskStore) =>
    async (_: undefined, context): Promise<IResult<TaskListItem[]>> => {
      const caller = requireSignedIn(context, 'Tasks');
      if (caller.isFailure()) return caller;
      return Result.ok(await tasks.listByOwner(caller.data.value));
    },
);
`,
  'src/Contexts/Tasks/Infrastructure/InMemoryTaskStore.ts': `import { InMemoryDataSource } from '@Architecture/Infrastructure/DataSources/InMemoryDataSource';

import { ITaskStore, TaskListItem, TaskRecord } from '@Contexts/Tasks/Application/ITaskStore';

export class InMemoryTaskStore implements ITaskStore {
  constructor(private readonly dataSource: InMemoryDataSource<TaskRecord>) {}

  async get(id: string): Promise<TaskRecord | undefined> {
    return this.dataSource.collection.get(id);
  }

  async put(task: TaskRecord): Promise<void> {
    this.dataSource.collection.set(task.id, task);
  }

  async listByOwner(owner: string): Promise<TaskListItem[]> {
    return [...this.dataSource.collection.values()]
      .filter(task => task.owner === owner)
      .map(({ id, title, completed }) => ({ id, title, completed }));
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
import { InMemoryDataSource } from '@Architecture/Infrastructure/DataSources/InMemoryDataSource';

import { TaskRecord } from '@Contexts/Tasks/Application/ITaskStore';
import { addTask, completeTask, listMyTasks } from '@Contexts/Tasks/Application/Tasks';
import { InMemoryTaskStore } from '@Contexts/Tasks/Infrastructure/InMemoryTaskStore';

const taskStore = new InMemoryTaskStore(new InMemoryDataSource<TaskRecord>());

export const localTasksModule = new LiteModule({
  name: 'Tasks',
  useCases: [addTask(taskStore), completeTask(taskStore), listMyTasks(taskStore)],
});
`,
  'src/SharedKernel/Application/IntegrationEvents/TaskIntegrationEvents.ts': `import { IntegrationEvent } from '@Architecture/Domain';

/** A task was completed by its owner: what another context may react to. */
export class TaskCompletedIntegrationEvent extends IntegrationEvent<{ taskId: string; ownerId: string }> {}
`,
};

/**
 * Writes the Tasks context into an application created Lite: its files, its declaration in the binding
 * (held to Lite by the binding's `default_profile`), its description in the domain map, and its module and
 * routes in the composition root.
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
  edit('src/Bootstrap/Fastify/createApplication.ts', text =>
    text
      .replace(
        "import { FastifyApplication } from '@Bootstrap/Fastify/FastifyApplication';",
        "import { localTasksModule } from '@Contexts/Tasks/module.local';\nimport { taskRoutes } from '@Contexts/Tasks/Presentation/task.routes';\n\nimport { FastifyApplication } from '@Bootstrap/Fastify/FastifyApplication';",
      )
      .replace(
        '    new InMemoryEventBus({ eventEmitter: new EventEmitter() }),\n  );',
        "    new InMemoryEventBus({ eventEmitter: new EventEmitter() }),\n  )\n    .registerModule(localTasksModule)\n    .registerRoutes('/tasks', taskRoutes, { module: localTasksModule });",
      ),
  );
}
