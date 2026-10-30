import { ChildProcess, spawn } from 'child_process';
import { createServer as createHttpServer, Server } from 'http';
import { createServer } from 'net';

/**
 * What the robustness campaign's hidden tests share (docs/evaluations/benchmark/robustness): the
 * server runs as a process of its own, started from the entry point the grader names
 * (ACCEPTANCE_ENTRY), on a SQLite file (DATABASE_PATH), so that a test can kill it the way a power
 * cut would and start it again on the same file. Nothing here knows how a tree is written.
 */
export type Json = Record<string, unknown>;

const entry = process.env.ACCEPTANCE_ENTRY ?? 'src/Bootstrap/Fastify/application.ts';

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const freePort = () =>
  new Promise<number>(resolve => {
    const server = createServer().listen(0, () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
  });

export interface Running {
  child: ChildProcess;
  /** Settles when the process has exited, however it ended. */
  exited: Promise<void>;
}

/** Starts the server on `database`, with `environment` added, and waits until it answers. */
export async function start(
  port: number,
  database: string,
  environment: Record<string, string> = {},
): Promise<Running> {
  const child = spawn('npx', ['tsx', '--tsconfig', './tsconfig.json', entry], {
    env: { ...process.env, PORT: String(port), DATABASE_PATH: database, NODE_ENV: 'production', ...environment },
    stdio: 'ignore',
    detached: true,
  });
  const exited = new Promise<void>(resolve => child.once('exit', () => resolve()));
  let gone = false;
  void exited.then(() => (gone = true));
  for (let attempt = 0; attempt < 300 && !gone; attempt++) {
    try {
      await fetch(`http://127.0.0.1:${port}/v1/notes`);
      return { child, exited };
    } catch {
      await sleep(100);
    }
  }
  throw new Error(gone ? 'the server exited before it answered' : 'the server never answered');
}

/** A power cut: the whole process group is killed at once, with no chance to finish anything. */
export async function kill(running: Running): Promise<void> {
  try {
    process.kill(-running.child.pid!, 'SIGKILL');
  } catch {
    // already gone
  }
  await running.exited;
}

/** An ordinary stop, then a kill if the process does not leave within five seconds. */
export async function stop(running: Running): Promise<void> {
  try {
    process.kill(-running.child.pid!, 'SIGTERM');
  } catch {
    return;
  }
  await Promise.race([running.exited, sleep(5000)]);
  await kill(running);
}

/** Reads until the answer is the expected one, or gives up and returns the last answer. */
export async function eventually<T>(read: () => Promise<T>, expected: (value: T) => boolean, ms = 10000): Promise<T> {
  const until = Date.now() + ms;
  let value = await read();
  while (!expected(value) && Date.now() < until) {
    await sleep(50);
    value = await read();
  }
  return value;
}

export function client(port: number) {
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
    let parsed: unknown = undefined;
    try {
      parsed = text ? JSON.parse(text) : undefined;
    } catch {
      parsed = text;
    }
    return { status: response.status, body: parsed as Json };
  };
  /** What a command came to: the 202's operation, followed until it ends. */
  const outcome = async (accepted: { status: number; body: Json }, token?: string) => {
    expect(accepted.status).toBe(202);
    const ended = await eventually(
      async () => (await call('GET', `/tracker/operations/${accepted.body.operationId}`, token)).body,
      body => body?.status === 'SUCCESS' || body?.status === 'ERROR',
      20000,
    );
    if (ended?.status !== 'SUCCESS' && ended?.status !== 'ERROR') throw new Error('the operation never ended');
    return ended;
  };
  const command = async (method: string, path: string, token?: string, body?: Json) =>
    outcome(await call(method, path, token, body), token);
  const login = async (email: string) => {
    const answer = await call('POST', '/accounts/login', undefined, { email, password: 'secret123' });
    expect(answer.status).toBe(200);
    return String(answer.body.token);
  };
  const account = async (email: string) => {
    const signedUp = await command('POST', '/accounts', undefined, { email, password: 'secret123' });
    expect(signedUp.status).toBe('SUCCESS');
    return { id: String(signedUp.result), email, token: await login(email) };
  };
  const note = async (token: string, title: string, text = '') => {
    const written = await command('POST', '/notes', token, { title, text });
    expect(written.status).toBe('SUCCESS');
    return String(written.result);
  };
  const list = async (path: string, token: string) => {
    const { status, body } = await call('GET', path, token);
    expect(status).toBe(200);
    return body as unknown as Json[];
  };
  return { call, outcome, command, login, account, note, list };
}

/** The notices of one archiving of one note, in a person's notifications. */
export const archivedNotices = (notifications: Json[], noteId: string) =>
  notifications.filter(notification => notification.kind === 'note-archived' && notification.noteId === noteId);

/**
 * The outside notification service of feature 17, as the test plays it: it records every attempt,
 * refuses the first `refusals` attempts of each notification (503), and accepts the next. While
 * `accepting` is false it refuses everything.
 */
export function notificationService(refusals = 3) {
  const attempts: Json[] = [];
  const accepted = new Map<string, Json>();
  const tries = new Map<string, number>();
  const state = { accepting: true };
  const server: Server = createHttpServer((request, response) => {
    let raw = '';
    request.on('data', chunk => (raw += chunk));
    request.on('end', () => {
      let body: Json = {};
      try {
        body = JSON.parse(raw) as Json;
      } catch {
        // an attempt the service cannot read is recorded as it came, and refused
      }
      attempts.push(body);
      const id = String(body.id);
      const tried = (tries.get(id) ?? 0) + 1;
      tries.set(id, tried);
      if (!state.accepting || tried <= refusals) {
        response.writeHead(503).end();
        return;
      }
      if (!accepted.has(id)) accepted.set(id, body);
      response.writeHead(200, { 'content-type': 'application/json' }).end('{}');
    });
  });
  const listening = new Promise<string>(resolve =>
    server.listen(0, '127.0.0.1', () =>
      resolve(`http://127.0.0.1:${(server.address() as { port: number }).port}/notify`),
    ),
  );
  return {
    url: () => listening,
    attempts,
    accepted,
    state,
    attemptsOf: (id: string) => attempts.filter(attempt => attempt.id === id),
    close: () => new Promise<void>(resolve => server.close(() => resolve())),
  };
}
