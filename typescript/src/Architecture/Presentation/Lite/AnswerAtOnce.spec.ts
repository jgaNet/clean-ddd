import { expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

import {
  ConcurrencyConflictException,
  Exception,
  NotAllowedException,
  NotFoundException,
  Result,
} from '@Architecture/Domain';
import { EventBus, ExecutionContext } from '@Architecture/Application';
import { command, query } from '@Architecture/Application/Lite/UseCase';
import { answerAtOnce, INTERNAL_ERROR } from '@Architecture/Presentation/Lite/AnswerAtOnce';

/**
 * The Lite transport (ADR 40, the `http-lite` grammar), over real HTTP: a route runs its use case and
 * answers at once — 201 with the new id, 200 with a result or a read model, 204 for nothing — and a
 * refusal answers at once with its status and the rule's exception, the same on every route.
 */

class BlankTitleException extends Exception {
  constructor() {
    super({ service: 'Tasks', type: 'BlankTitle', message: 'A task has a title' });
  }
}

const tasks = new Map<string, string>();
const signedIn = (context: ExecutionContext) => Boolean(context.auth.subjectId);

const addTask = command('AddTask', () => async ({ title }: { title: string }, context) => {
  if (!signedIn(context)) return Result.fail(new NotAllowedException('Tasks', 'Authentication required'));
  if (!title.trim()) return Result.fail(new BlankTitleException());
  tasks.set('t1', title);
  return Result.ok('t1');
});
const renameTask = command('RenameTask', () => async ({ id, title }: { id: string; title: string }) => {
  if (!tasks.has(id)) return Result.fail(new NotFoundException('Tasks', `No task ${id}`));
  if (title === 'race') return Result.fail(new ConcurrencyConflictException('Tasks', 'changed'));
  tasks.set(id, title);
  return Result.ok({ id, title });
});
const removeTask = command('RemoveTask', () => async ({ id }: { id: string }, context) => {
  if (context.auth.role !== 'ADMIN') return Result.fail(new NotAllowedException('Tasks', 'Administrators only'));
  tasks.delete(id);
  return Result.ok(undefined);
});
const explode = command('Explode', () => async () => {
  throw new Error('a programming error');
});
const listTasks = query('ListTasks', () => async () => Result.ok([...tasks.values()]));

const eventBus = { connect: jest.fn(), publish: jest.fn(), subscribe: jest.fn() } as EventBus;
type Body = { title: string };

let fastify: FastifyInstance;
beforeAll(async () => {
  fastify = Fastify();
  // What the transport does per request: who is calling, read here from a header for the spec.
  const request = (req: { headers: Record<string, unknown> }) => {
    const [subjectId, role] = String(req.headers['x-caller'] ?? '').split(':');
    return { executionContext: new ExecutionContext({ traceId: 't', eventBus, auth: { subjectId, role } }) };
  };
  fastify.post<{ Body: Body }>('/tasks', (req, reply) =>
    answerAtOnce(request(req), reply, addTask(), { title: req.body.title }, { created: true }),
  );
  fastify.put<{ Params: { id: string }; Body: Body }>('/tasks/:id', (req, reply) =>
    answerAtOnce(request(req), reply, renameTask(), { id: req.params.id, title: req.body.title }),
  );
  fastify.delete<{ Params: { id: string } }>('/tasks/:id', (req, reply) =>
    answerAtOnce(request(req), reply, removeTask(), { id: req.params.id }),
  );
  fastify.post('/explode', (req, reply) => answerAtOnce(request(req), reply, explode(), undefined));
  fastify.get('/tasks', (req, reply) => answerAtOnce(request(req), reply, listTasks(), undefined));
  await fastify.ready();
});
afterAll(() => fastify.close());

const send = async (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, caller = '', payload?: object) => {
  const response = await fastify.inject({ method, url, payload, headers: caller ? { 'x-caller': caller } : {} });
  return { status: response.statusCode, body: response.body ? JSON.parse(response.body) : undefined };
};

describe('answerAtOnce', () => {
  it('answers a command that creates with 201 and the id its use case generated', async () => {
    expect(await send('POST', '/tasks', 'alice:USER', { title: 'Write the spec' })).toEqual({
      status: 201,
      body: { id: 't1' },
    });
  });

  it('answers another command with 200 and its result, or 204 when it returns nothing; a query with 200', async () => {
    expect(await send('PUT', '/tasks/t1', 'alice:USER', { title: 'Rewrite it' })).toEqual({
      status: 200,
      body: { id: 't1', title: 'Rewrite it' },
    });
    expect(await send('GET', '/tasks')).toEqual({ status: 200, body: ['Rewrite it'] });
    expect(await send('DELETE', '/tasks/t1', 'root:ADMIN')).toEqual({ status: 204, body: undefined });
  });

  it('answers a refusal at once, with its status and the rule’s exception', async () => {
    expect(await send('POST', '/tasks', '', { title: 'x' })).toEqual({
      status: 401,
      body: { type: 'NotAllowed', message: 'Authentication required' },
    });
    expect((await send('DELETE', '/tasks/t1', 'alice:USER')).status).toBe(403);
    expect(await send('POST', '/tasks', 'alice:USER', { title: ' ' })).toEqual({
      status: 400,
      body: { type: 'BlankTitle', message: 'A task has a title' },
    });
    expect((await send('PUT', '/tasks/none', 'alice:USER', { title: 'x' })).status).toBe(404);
    tasks.set('t2', 'Two');
    expect((await send('PUT', '/tasks/t2', 'alice:USER', { title: 'race' })).status).toBe(409);
  });

  it('answers an unexpected failure with 500 and says nothing of it', async () => {
    expect(await send('POST', '/explode')).toEqual({ status: 500, body: { message: INTERNAL_ERROR } });
  });
});
