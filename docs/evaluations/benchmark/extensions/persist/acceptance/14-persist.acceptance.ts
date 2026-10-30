import { ChildProcess, spawn } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { createServer } from 'net';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * The persistence experiment's hidden test (docs/evaluations/benchmark/extensions): the server
 * runs as a process of its own, started from the entry point the grader names (ACCEPTANCE_ENTRY),
 * with PORT and DATABASE_PATH. Everything is written, the process is stopped, a second one starts
 * on the same file, and every read answers as it did before the restart.
 */
type Json = Record<string, unknown>;

const entry = process.env.ACCEPTANCE_ENTRY ?? 'src/Bootstrap/Fastify/application.ts';
const directory = mkdtempSync(join(tmpdir(), 'persist-'));
const database = join(directory, 'notes.sqlite');

const freePort = () =>
  new Promise<number>(resolve => {
    const server = createServer().listen(0, () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
  });

async function start(port: number): Promise<ChildProcess> {
  const child = spawn('npx', ['tsx', '--tsconfig', './tsconfig.json', entry], {
    env: { ...process.env, PORT: String(port), DATABASE_PATH: database, NODE_ENV: 'production' },
    stdio: 'ignore',
    detached: true,
  });
  for (let attempt = 0; attempt < 300; attempt++) {
    try {
      await fetch(`http://127.0.0.1:${port}/v1/notes`);
      return child;
    } catch {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  throw new Error('the server never answered');
}

async function stop(child: ChildProcess): Promise<void> {
  const exited = new Promise(resolve => child.once('exit', resolve));
  process.kill(-child.pid!, 'SIGTERM');
  await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 5000))]);
  try {
    process.kill(-child.pid!, 'SIGKILL');
  } catch {
    // already gone
  }
}

function client(port: number) {
  const api = `http://127.0.0.1:${port}/v1`;
  const call = async (method: string, path: string, token?: string, body?: Json) => {
    const response = await fetch(`${api}${path}`, {
      method,
      headers: {
        ...(body && { 'content-type': 'application/json' }),
        ...(token && { authorization: `Bearer ${token}` }),
      },
      body: body && JSON.stringify(body),
    });
    const text = await response.text();
    return { status: response.status, body: (text ? JSON.parse(text) : undefined) as Json };
  };
  const outcome = async (accepted: { status: number; body: Json }, token?: string) => {
    expect(accepted.status).toBe(202);
    for (let attempt = 0; attempt < 200; attempt++) {
      const { body } = await call('GET', `/tracker/operations/${accepted.body.operationId}`, token);
      if (body?.status === 'SUCCESS' || body?.status === 'ERROR') return body;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error('the operation never ended');
  };
  const command = async (method: string, path: string, token?: string, body?: Json) => {
    const accepted = await call(method, path, token, body);
    const ended = await outcome(accepted, token);
    expect(ended.status).toBe('SUCCESS');
    return { operationId: String(accepted.body.operationId), result: ended.result };
  };
  const login = async (email: string) => {
    const answer = await call('POST', '/accounts/login', undefined, { email, password: 'secret123' });
    expect(answer.status).toBe(200);
    return String(answer.body.token);
  };
  return { call, command, login };
}

afterAll(() => rmSync(directory, { recursive: true, force: true }));

describe('persistence', () => {
  it('answers every read after a restart as it did before, and keeps working', async () => {
    const port = await freePort();
    let server = await start(port);
    const { call, command, login } = client(port);
    let ada: string;
    let bob: string;
    const reads = async () => ({
      me: (await call('GET', '/accounts/me', ada)).body,
      notes: (await call('GET', '/notes', ada)).body,
      tagged: (await call('GET', '/notes?tag=work', ada)).body,
      shared: (await call('GET', '/notes/shared', bob)).body,
      plan: (await call('GET', '/plans/me', ada)).body,
      bobsNotifications: (await call('GET', '/notifications', bob)).body,
    });
    let before: Json;
    let kept: string;
    let operationId: string;
    try {
      const adaId = String((await command('POST', '/accounts', undefined, { email: 'ada@persist.test', password: 'secret123' })).result);
      const bobId = String((await command('POST', '/accounts', undefined, { email: 'bob@persist.test', password: 'secret123' })).result);
      ada = await login('ada@persist.test');
      bob = await login('bob@persist.test');
      const written = await command('POST', '/notes', ada, { title: 'Kept', text: 'first' });
      kept = String(written.result);
      operationId = written.operationId;
      const archived = String((await command('POST', '/notes', ada, { title: 'Archived', text: '' })).result);
      await command('PUT', `/notes/${kept}`, ada, { title: 'Kept', text: 'edited' });
      await command('POST', `/notes/${kept}/pin`, ada);
      await command('POST', `/notes/${kept}/tags`, ada, { tag: 'work' });
      await command('POST', `/notes/${kept}/share`, ada, { accountId: bobId });
      await command('POST', `/notes/${archived}/share`, ada, { accountId: bobId });
      await command('POST', `/notes/${archived}/archive`, ada);
      await command('PUT', '/plans/me', ada, { plan: 'unlimited' });
      const remindAt = new Date(Date.now() + 6000).toISOString();
      await command('POST', `/notes/${kept}/reminders`, ada, { remindAt });
      expect(adaId).not.toBe(bobId);
      // The archiving notification reaches Bob after the command's outcome.
      for (let attempt = 0; attempt < 100; attempt++) {
        if (((await call('GET', '/notifications', bob)).body as unknown as Json[]).length) break;
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      before = await reads();
      expect((before.notes as unknown as Json[]).length).toBe(2);
      expect((before.bobsNotifications as unknown as Json[]).length).toBe(1);
    } finally {
      await stop(server);
    }

    server = await start(port);
    try {
      ada = await login('ada@persist.test');
      bob = await login('bob@persist.test');
      expect(await reads()).toEqual(before);
      expect((await call('GET', `/notes/${kept}`, ada)).body).toMatchObject({ pinned: true, tags: ['work'], text: 'edited' });
      expect((await call('GET', `/tracker/operations/${operationId}`, ada)).body).toMatchObject({ status: 'SUCCESS', result: kept });
      // The reminder scheduled before the restart is told once its moment has come.
      let reminders: Json[] = [];
      for (let attempt = 0; attempt < 100 && !reminders.length; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 100));
        reminders = ((await call('GET', '/notifications', ada)).body as unknown as Json[]).filter(each => each.kind === 'reminder');
      }
      expect(reminders).toEqual([expect.objectContaining({ kind: 'reminder', noteId: kept, noteTitle: 'Kept' })]);
      // And it keeps working.
      const third = String((await command('POST', '/notes', ada, { title: 'After', text: '' })).result);
      expect(((await call('GET', '/notes', ada)).body as unknown as Json[]).map(note => note.id)).toContain(third);
    } finally {
      await stop(server);
    }
  }, 120_000);
});
