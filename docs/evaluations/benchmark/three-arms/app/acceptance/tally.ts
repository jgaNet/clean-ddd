import Ajv from 'ajv';
import { ChildProcess, spawn } from 'child_process';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { createServer } from 'net';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * What Tally's hidden tests share (docs/evaluations/benchmark/three-arms/app). The server runs as a
 * process of its own, from the entry point the grader names (ACCEPTANCE_ENTRY), on a SQLite file of
 * its own (DATABASE_PATH), so that a test can stop it, kill it the way a power cut would, start it
 * again on the same file, or start a second one beside it. Nothing here knows how a tree is
 * written: every test goes through the API the requests give, and a command may answer at once or
 * later (request 1), so the client below reads both. Every answer it reads is held to the API the
 * requests give up to the one graded (API_SCHEMA, written by the grader from the kit's api/;
 * docs/evaluations/benchmark/kit-standard.md): an answer of another shape fails the test that read
 * it, naming the request whose shape it breaks.
 */
export type Json = Record<string, unknown>;
export interface Answer {
  status: number;
  body: Json;
}

const api = process.env.API_SCHEMA ? JSON.parse(readFileSync(process.env.API_SCHEMA, 'utf8')) : undefined;
const ajv = new Ajv({ allErrors: true, verbose: true, strict: false });

/** Throws, naming the requests whose shape the answer breaks; a route no request declares is not held. */
function holdToApi(method: string, path: string, status: number, body: unknown) {
  const responses = api?.routes.find(
    (r: { method: string; pattern: string }) => r.method === method && new RegExp(r.pattern).test(path),
  )?.responses;
  const schema = responses && (responses[status] ?? responses[`${String(status)[0]}xx`] ?? responses.default);
  if (schema && !ajv.validate(schema, body))
    throw new Error(
      `${method} ${path} answered ${status}: ${(ajv.errors as { dataPath?: string; instancePath?: string; message?: string; parentSchema?: { $comment?: string } }[]).map(e => `${e.dataPath ?? e.instancePath} ${e.message} (${e.parentSchema?.$comment})`).join('; ')}`,
    );
}

/**
 * Whether the request graded has reached request `n`: a case that asserts a rule a later request `n`
 * changes asserts it only before `n`, and from `n` on only what `n` keeps (the README's "superseded
 * cases"). The grader composes the API up to the request it grades (`upto`); graded whole, or with no
 * API_SCHEMA, every request is reached.
 */
export const reached = (n: number) => (api?.upto ?? Infinity) >= n;

const entry = process.env.ACCEPTANCE_ENTRY ?? 'src/Bootstrap/Fastify/application.ts';
export const PASSWORD = 'secret-password';

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * How often every server the tests start runs its background job (request 1's `JOBS_INTERVAL_SECONDS`): what
 * changes with time is changed there, at the next sweep, never by a read.
 */
export const JOBS_INTERVAL_SECONDS = 1;

/**
 * How long a test waits for what the next sweep does once `seconds` have passed: three runs of the job, and three
 * seconds more for a loaded machine. A test reads with `eventually` until then; it never sleeps a fixed time.
 */
export const bySweep = (seconds: number) => (seconds + 3 * JOBS_INTERVAL_SECONDS) * 1000 + 3000;

/** A date `days` from today (negative: before), in UTC, as the API writes dates. */
export const day = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

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
  const directory = mkdtempSync(join(tmpdir(), `tally-${name}-`));
  return {
    path: join(directory, 'tally.sqlite'),
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

/**
 * The tree as it stood before a request marked `upgrade` in the backlog (a change to what a tree already stored), for
 * that request's test to record through before it reads through the tree graded, on the same database. The grader
 * checks it out and names it (ACCEPTANCE_PREVIOUS, a JSON map from the feature's id to the directory). Graded
 * without it, the answer is undefined, and `start` runs the tree graded in its place: that half of the test then
 * holds nothing, and the grader's report says so.
 */
export const previous = (feature: string): string | undefined =>
  (JSON.parse(process.env.ACCEPTANCE_PREVIOUS ?? '{}') as Record<string, string>)[feature];

/**
 * Starts a server on `path`, with `JOBS_INTERVAL_SECONDS` and `environment` added, and waits until it answers
 * anything; from the tree in `directory`, when it is given (`previous`), else from the tree graded.
 */
export async function start(
  path: string,
  environment: Record<string, string> = {},
  directory?: string,
): Promise<Running> {
  await awayFromMidnight();
  const port = await freePort();
  const child = spawn('npx', ['tsx', '--tsconfig', './tsconfig.json', entry], {
    ...(directory && { cwd: directory }),
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_PATH: path,
      NODE_ENV: 'production',
      JOBS_INTERVAL_SECONDS: String(JOBS_INTERVAL_SECONDS),
      ...environment,
    },
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
  /** Whether it was answered later: `202 { operationId }`, followed to its end. */
  later: boolean;
  /** The status it was answered with first: a 2xx or 4xx at once, or 202. */
  status: number;
  /** For a refusal answered later, the operation's `error` (request 1): the refused rule's name, and a sentence. */
  error?: { type: string; message: string };
}

/** The id a command that creates something answers: `{ id }` at once, or the operation's result later. */
export const idOf = (result: unknown) =>
  typeof result === 'string' ? result : String((result as Json | undefined)?.id ?? '');

/** A member's share of an expense, as `GET /v1/expenses/{id}` reads it (request 4). */
export interface Share {
  memberId: string;
  amount: number;
}

/** The body of an expense: one of the three splits (requests 4 and 7). */
export type ExpenseBody = {
  description?: string;
  amount?: number;
  date?: string;
  splitBetween?: string[];
  splitExactly?: { memberId: string; amount: number }[];
  splitByShares?: { memberId: string; shares: number }[];
};

export interface Person {
  id: string;
  email: string;
  name: string;
  token: string;
}

export function client(port: number) {
  const origin = `http://127.0.0.1:${port}`;
  const call = async (
    method: string,
    path: string,
    token?: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<Answer> => {
    const response = await fetch(`${origin}/v1${path}`, {
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
    holdToApi(method, `/v1${path}`, response.status, parsed);
    return { status: response.status, body: parsed as Json };
  };

  /**
   * A request that changes something, followed to its outcome (request 1): a `2xx` is accepted with
   * its body, a `4xx` is refused, and a `202 { operationId }` is read at `/operations/{id}` until it
   * ends in `SUCCESS` or `ERROR`. A `5xx` is not a refusal: the server broke, and the test says so.
   * An operation that ends in `ERROR` has `error: { type, message }` (request 1), or the test says so.
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
      if (ended.status === 'SUCCESS') return { accepted: true, result: ended.result, later: true, status: 202 };
      const error = ended.error as Json | undefined;
      if (typeof error?.type !== 'string' || !error.type || typeof error.message !== 'string')
        throw new Error(
          `${method} ${path}: the operation ended in ERROR without error { type, message } (request 1): ${JSON.stringify(ended)}`,
        );
      return {
        accepted: false,
        result: ended.result,
        later: true,
        status: 202,
        error: { type: error.type, message: error.message },
      };
    }
    const accepted = answer.status >= 200 && answer.status < 300;
    return { accepted, result: answer.body, later: false, status: answer.status };
  };
  /** A command that must be accepted. */
  const done = async (method: string, path: string, token?: string, body?: unknown) => {
    const outcome = await act(method, path, token, body);
    if (!outcome.accepted) throw new Error(`${method} ${path} was refused: ${JSON.stringify(outcome.result)}`);
    return outcome.result;
  };
  /** A command that creates something and must be accepted: the new thing's id. */
  const create = async (path: string, token?: string, body?: unknown) => {
    const outcome = await act('POST', path, token, body);
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
  /**
   * The status of a read the caller may not have, for the test to require its one (request 1): `404` for
   * something that does not exist or that the caller may not see, signed in or not; `401` for a read that needs a
   * signed-in caller and has none. Never `403` for a read.
   */
  const hidden = async (path: string, token?: string) => (await call('GET', path, token)).status;

  const login = async (email: string, password = PASSWORD) => {
    const answer = await call('POST', '/accounts/login', undefined, { email, password });
    if (answer.status !== 200) throw new Error(`login of ${email} answered ${answer.status}`);
    return String(answer.body.token);
  };
  /** An account, signed in. Its name is the email's first part, capitalised, unless given. */
  const person = async (email: string, name = email[0].toUpperCase() + email.slice(1, email.indexOf('@'))) => {
    const id = await create('/accounts', undefined, { email, password: PASSWORD, name });
    return { id, email, name, token: await login(email) } as Person;
  };

  /** A group created by `owner`, in `currency`. */
  const group = (owner: Person, name = 'The flat', currency = 'EUR') =>
    create('/groups', owner.token, { name, currency });
  /** An invitation to the group, created by `by`, a member. */
  const invite = (by: Person, groupId: string) => create(`/groups/${groupId}/invitations`, by.token);
  /** `who` joins with the invitation. */
  const join = (who: Person, invitationId: string) => done('POST', `/invitations/${invitationId}/accept`, who.token);
  /** A group of `owner` that each of `others` joins, in that order. */
  const groupOf = async (owner: Person, others: Person[], name = 'The flat') => {
    const groupId = await group(owner, name);
    const invitation = await invite(owner, groupId);
    for (const other of others) await join(other, invitation);
    return groupId;
  };
  /** An expense `payer` records in the group, today unless dated, split as the body says. */
  const expense = (payer: Person, groupId: string, body: ExpenseBody) =>
    create(`/groups/${groupId}/expenses`, payer.token, { description: 'Groceries', date: day(0), ...body });
  const shares = async (expenseId: string, token: string) =>
    (await read(`/expenses/${expenseId}`, token)).shares as Share[];
  /** The group's balances (request 5), as a map from member to balance, and in their order. */
  const balances = async (groupId: string, token: string) => {
    const each = (await list(`/groups/${groupId}/balances`, token)) as unknown as {
      memberId: string;
      balance: number;
    }[];
    return {
      order: each.map(one => one.memberId),
      of: Object.fromEntries(each.map(one => [one.memberId, one.balance])),
      sum: each.reduce((total, one) => total + one.balance, 0),
    };
  };
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
    person,
    group,
    invite,
    join,
    groupOf,
    expense,
    shares,
    balances,
  };
}

export type Client = ReturnType<typeof client>;

/** The shares of an expense as `[memberId, amount]` pairs, in their order. */
export const pairs = (shares: Share[]) => shares.map(share => [share.memberId, share.amount]);

/**
 * What every split keeps, whoever takes the remainder (requests 4, 7 and 10): the members in the order given,
 * each share the amount's part rounded down or that part and the whole remainder, and the shares adding up to the
 * amount exactly. `weights` are the members' shares (1 each for an equal split).
 */
export function keepsTheSplit(shares: Share[], amount: number, members: string[], weights = members.map(() => 1)) {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const down = weights.map(weight => Math.floor((amount * weight) / total));
  const remainder = amount - down.reduce((sum, each) => sum + each, 0);
  expect(shares.map(share => share.memberId)).toEqual(members);
  expect(shares.reduce((sum, share) => sum + share.amount, 0)).toBe(amount);
  const over = shares.map((share, n) => share.amount - down[n]);
  expect(over.filter(each => each !== 0).length).toBeLessThanOrEqual(1);
  expect(over.every(each => each === 0 || each === remainder)).toBe(true);
}
