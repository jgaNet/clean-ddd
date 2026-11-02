import { ChildProcess, spawn } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { createServer as createHttpServer, Server } from 'http';
import { createServer } from 'net';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * What OpenStay's hidden tests share (docs/evaluations/benchmark/openstay). The server runs as a
 * process of its own, from the entry point the grader names (ACCEPTANCE_ENTRY), on a SQLite file of
 * its own (DATABASE_PATH), so that a test can stop it, kill it the way a power cut would, start it
 * again on the same file, or start a second one beside it. Nothing here knows how a tree is
 * written: every test goes through the API the requests give, and a command may answer at once or
 * later (request 1), so the client below reads both.
 */
export type Json = Record<string, unknown>;
export interface Answer {
  status: number;
  body: Json;
}

const entry = process.env.ACCEPTANCE_ENTRY ?? 'src/Bootstrap/Fastify/application.ts';
export const PASSWORD = 'secret-password';

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** A date `days` from today, in UTC, as the API writes dates. */
export const day = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

export const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** How many days from today the first `weekday` (in UTC) at least `from` days ahead falls. */
export const daysTo = (weekday: string, from = 0) => {
  const today = new Date(Date.now() + from * 86_400_000).getUTCDay();
  return from + ((WEEKDAYS.indexOf(weekday) - today + 7) % 7);
};

const freePort = () =>
  new Promise<number>(resolve => {
    const server = createServer().listen(0, () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
  });

/** Reads until the answer is the expected one, or gives up and returns the last answer. */
export async function eventually<T>(read: () => Promise<T>, expected: (value: T) => boolean, ms = 15000): Promise<T> {
  const until = Date.now() + ms;
  let value = await read();
  while (!expected(value) && Date.now() < until) {
    await sleep(50);
    value = await read();
  }
  return value;
}

/** A database file of its own, in a directory removed with `remove()`. */
export function database(name: string) {
  const directory = mkdtempSync(join(tmpdir(), `openstay-${name}-`));
  return {
    path: join(directory, 'openstay.sqlite'),
    remove: () => rmSync(directory, { recursive: true, force: true }),
  };
}

export interface Running {
  port: number;
  child: ChildProcess;
  /** Settles when the process has exited, however it ended. */
  exited: Promise<void>;
}

/**
 * The tests compute dates from today, and the server decides what today is. Close to midnight UTC
 * the two could disagree, so a test file does not start in the last three minutes of a day: it
 * waits for the next one.
 */
async function awayFromMidnight() {
  const now = new Date();
  const left = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - now.getTime();
  if (left < 180_000) await sleep(left + 5000);
}

/** Starts a server on `path`, with `environment` added, and waits until it answers anything. */
export async function start(path: string, environment: Record<string, string> = {}): Promise<Running> {
  await awayFromMidnight();
  const port = await freePort();
  const child = spawn('npx', ['tsx', '--tsconfig', './tsconfig.json', entry], {
    env: { ...process.env, PORT: String(port), DATABASE_PATH: path, NODE_ENV: 'production', ...environment },
    stdio: 'ignore',
    detached: true,
  });
  const exited = new Promise<void>(resolve => child.once('exit', () => resolve()));
  let gone = false;
  void exited.then(() => (gone = true));
  for (let attempt = 0; attempt < 300 && !gone; attempt++) {
    try {
      await fetch(`http://127.0.0.1:${port}/v1/accounts/me`);
      return { port, child, exited };
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
  let timer: NodeJS.Timeout | undefined;
  await Promise.race([running.exited, new Promise(resolve => (timer = setTimeout(resolve, 5000)))]);
  clearTimeout(timer);
  await kill(running);
}

/** What a command came to, in either protocol: accepted with its result, or refused. */
export interface Outcome {
  accepted: boolean;
  result: unknown;
}

/** The id a command that creates something answers: `{ id }` at once, or the operation's result later. */
export const idOf = (result: unknown) =>
  typeof result === 'string' ? result : String((result as Json | undefined)?.id ?? '');

export function client(port: number) {
  const api = `http://127.0.0.1:${port}/v1`;
  const call = async (
    method: string,
    path: string,
    token?: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<Answer> => {
    const response = await fetch(`${api}${path}`, {
      method,
      headers: {
        ...(body !== undefined && { 'content-type': 'application/json' }),
        ...(token && { authorization: `Bearer ${token}` }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
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

  /**
   * A request that changes something, followed to its outcome (request 1): a `2xx` is accepted with
   * its body, a `4xx` is refused, and a `202 { operationId }` is read at `/operations/{id}` until it
   * ends in `SUCCESS` or `ERROR`. A `5xx` is not a refusal: the server broke, and the test says so.
   */
  const act = async (
    method: string,
    path: string,
    token?: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<Outcome> => {
    const answer = await call(method, path, token, body, headers);
    if (answer.status >= 500) throw new Error(`${method} ${path} answered ${answer.status}`);
    if (answer.status === 202 && typeof answer.body?.operationId === 'string') {
      const ended = await eventually(
        async () => (await call('GET', `/operations/${answer.body.operationId}`, token)).body,
        operation => operation?.status === 'SUCCESS' || operation?.status === 'ERROR',
        60000,
      );
      if (ended?.status !== 'SUCCESS' && ended?.status !== 'ERROR')
        throw new Error(`${method} ${path}: the operation never ended`);
      return { accepted: ended.status === 'SUCCESS', result: ended.result };
    }
    if (answer.status >= 200 && answer.status < 300) return { accepted: true, result: answer.body };
    return { accepted: false, result: answer.body };
  };
  /** A command that must be accepted. */
  const done = async (method: string, path: string, token?: string, body?: unknown) => {
    const outcome = await act(method, path, token, body);
    if (!outcome.accepted) throw new Error(`${method} ${path} was refused: ${JSON.stringify(outcome.result)}`);
    return outcome.result;
  };
  /** A command that creates something and must be accepted: the new thing's id. */
  const create = async (path: string, token?: string, body?: unknown, headers: Record<string, string> = {}) => {
    const outcome = await act('POST', path, token, body, headers);
    if (!outcome.accepted) throw new Error(`POST ${path} was refused: ${JSON.stringify(outcome.result)}`);
    const id = idOf(outcome.result);
    if (!id) throw new Error(`POST ${path} answered no id: ${JSON.stringify(outcome.result)}`);
    return id;
  };
  /** Whether a command was refused. */
  const refused = async (method: string, path: string, token?: string, body?: unknown) =>
    !(await act(method, path, token, body)).accepted;
  /** A read that must answer 200. */
  const read = async (path: string, token?: string) => {
    const answer = await call('GET', path, token);
    if (answer.status !== 200) throw new Error(`GET ${path} answered ${answer.status}`);
    return answer.body;
  };
  const list = async (path: string, token?: string) => (await read(path, token)) as unknown as Json[];
  /** Whether a read is refused as something that does not exist, or that the caller may not see. */
  const hidden = async (path: string, token?: string) => {
    const { status } = await call('GET', path, token);
    return status === 401 || status === 403 || status === 404;
  };

  const login = async (email: string, password = PASSWORD) => {
    const answer = await call('POST', '/accounts/login', undefined, { email, password });
    if (answer.status !== 200) throw new Error(`login of ${email} answered ${answer.status}`);
    return String(answer.body.token);
  };
  const account = async (email: string, roles: string[] = ['traveller']) => {
    const id = await create('/accounts', undefined, { email, password: PASSWORD, roles });
    return { id, email, token: await login(email) };
  };
  const host = (email: string) => account(email, ['host']);
  const traveller = (email: string) => account(email, ['traveller']);

  /** A listing, published unless said otherwise. */
  const listing = async (
    token: string,
    fields: Partial<{
      title: string;
      city: string;
      capacity: number;
      nightlyPrice: number;
      cleaningFee: number;
      cancellationPolicy: string;
    }> = {},
    publish = true,
  ) => {
    const id = await create('/listings', token, {
      title: 'A room with a view',
      city: 'Lyon',
      capacity: 2,
      nightlyPrice: 10000,
      cleaningFee: 2000,
      cancellationPolicy: 'flexible',
      ...fields,
    });
    if (publish) await done('POST', `/listings/${id}/publish`, token);
    return id;
  };
  const quote = (token: string, listingId: string, checkIn: string, checkOut: string, guests = 1) =>
    create('/quotes', token, { listingId, checkIn, checkOut, guests });
  const book = async (token: string, quoteId: string) => create('/bookings', token, { quoteId });
  return {
    call,
    act,
    done,
    create,
    refused,
    read,
    list,
    hidden,
    login,
    account,
    host,
    traveller,
    listing,
    quote,
    book,
  };
}

export type Client = ReturnType<typeof client>;

/**
 * The outside notification service of request 10, as the tests play it. It records every attempt
 * with its time, refuses the first `refusals` attempts of each notice (503), and accepts the next.
 * While `accepting` is false it refuses everything.
 */
export function notificationService(refusals = 3) {
  const attempts: { at: number; body: Json }[] = [];
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
      attempts.push({ at: Date.now(), body });
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
    attemptsOf: (id: string) => attempts.filter(attempt => attempt.body.id === id),
    close: () => new Promise<void>(resolve => server.close(() => resolve())),
  };
}
