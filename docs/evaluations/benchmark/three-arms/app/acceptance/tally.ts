import Ajv from 'ajv';
import { ChildProcess, execFileSync, spawn } from 'child_process';
import { createHmac, randomBytes, randomUUID } from 'crypto';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { createServer as createHttpServer, IncomingMessage, Server, ServerResponse } from 'http';
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
 *
 * From checkpoint 3 (requests 21 to 30) it also has: the rates service (`ratesService`, request 22) and the receipts
 * store (`receiptStore`, request 26) the tests play, as they play the provider; files (`JPEG`, `PNG`, `PDF`, `padded`)
 * and the client's `upload` (request 26) and `raw` (request 29's CSV); days by the month (`monthly`, `monthsFrom`,
 * request 23); and, from request 30, a PostgreSQL database of its own beside each SQLite file (`database`), given to
 * the server as `DATABASE_URL`.
 *
 * From checkpoint 4 (requests 31 to 40): the provider's fee on each payment (`state.fee`, request 38), and what the
 * PostgreSQL database holds of a text (`holds`, request 35's erasure).
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

/**
 * The PostgreSQL server the tests create their databases on from request 30 (`TALLY_POSTGRES`, a PostgreSQL 16 at
 * 127.0.0.1:55432 when it is not set, as request 30 says), through `psql`, which must be on the PATH.
 */
export const POSTGRES = process.env.TALLY_POSTGRES ?? 'postgresql://postgres@127.0.0.1:55432';
const psql = (sql: string, url = `${POSTGRES}/postgres`) =>
  execFileSync('psql', [url, '-v', 'ON_ERROR_STOP=1', '-tAc', sql], { encoding: 'utf8' }).trim();
const urls = new Map<string, string>();

/**
 * A database of its own: a SQLite file in a directory and, once request 30 is reached, a PostgreSQL database, both
 * removed with `remove()`. `start(path)` gives the server both (`DATABASE_PATH` and `DATABASE_URL`), and a tree uses
 * the one it knows. Before request 30, no PostgreSQL is needed, and `url` is empty.
 */
export function database(name: string) {
  const directory = mkdtempSync(join(tmpdir(), `tally-${name}-`));
  const path = join(directory, 'tally.sqlite');
  const pg = reached(30)
    ? `tally_${name.replace(/[^a-z0-9]/gi, '_')}_${process.pid}_${randomBytes(4).toString('hex')}`.toLowerCase()
    : undefined;
  if (pg) {
    psql(`CREATE DATABASE ${pg}`);
    urls.set(path, `${POSTGRES}/${pg}`);
  }
  const url = pg ? `${POSTGRES}/${pg}` : '';
  return {
    path,
    url,
    /** What the PostgreSQL database holds: the number of rows in all its tables (request 30). */
    rows: () =>
      pg
        ? Number(
            psql(
              `SELECT coalesce(sum((xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I', table_schema, table_name), false, true, '')))[1]::text::int), 0) FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog', 'information_schema') AND table_type = 'BASE TABLE'`,
              url,
            ) || 0,
          )
        : 0,
    /**
     * How many rows, in every table of the PostgreSQL database, hold `text` anywhere in them, whatever its case
     * (request 35: a deleted account's name and email are kept nowhere).
     */
    holds: (text: string) =>
      pg
        ? Number(
            psql(
              `SELECT coalesce(sum((xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I t WHERE strpos(lower(t::text), %L) > 0', table_schema, table_name, lower('${text.replace(/'/g, "''")}')), false, true, '')))[1]::text::int), 0) FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog', 'information_schema') AND table_type = 'BASE TABLE'`,
              url,
            ) || 0,
          )
        : 0,
    remove: () => {
      rmSync(directory, { recursive: true, force: true });
      if (!pg) return;
      try {
        psql(`DROP DATABASE IF EXISTS ${pg} WITH (FORCE)`);
      } catch {
        // a database a server still holds is left for the machine's cleanup
      }
    },
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
      ...(urls.has(path) && { DATABASE_URL: urls.get(path) }),
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

/**
 * The body of an expense: one of the three splits (requests 4 and 7) or a template (request 25); its amount, or what
 * was paid in another currency (requests 21 and 22); its category (request 24).
 */
export type ExpenseBody = {
  description?: string;
  amount?: number;
  original?: { currency: string; amount: number; rate?: string };
  date?: string;
  category?: string;
  splitBetween?: string[];
  splitExactly?: { memberId: string; amount: number }[];
  splitByShares?: { memberId: string; shares: number }[];
  template?: string;
};

export interface Person {
  id: string;
  email: string;
  name: string;
  token: string;
}

/**
 * A client of the server on `port`. Every answer it reads is held to the API composed up to the request graded,
 * unless `held` is false: the client of a tree before an `upgrade` (`previous`), whose answers are an earlier
 * request's, which a later request may have added a field to (request 24's `category`, read through request 10's
 * tree before it).
 */
export function client(port: number, held = true) {
  const origin = `http://127.0.0.1:${port}`;
  const call = async (
    method: string,
    path: string,
    token?: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<Answer> => {
    // A file is sent as it is (request 26); anything else as JSON.
    const bytes = body instanceof Uint8Array;
    const response = await fetch(`${origin}/v1${path}`, {
      method,
      headers: {
        ...(body !== undefined && { 'content-type': bytes ? 'application/octet-stream' : 'application/json' }),
        ...(token && { authorization: `Bearer ${token}` }),
        ...headers,
      },
      body: body === undefined ? undefined : bytes ? new Uint8Array(body) : JSON.stringify(body),
    });
    const text = await response.text();
    let parsed: unknown = undefined;
    try {
      parsed = text ? JSON.parse(text) : undefined;
    } catch {
      parsed = text;
    }
    if (held) holdToApi(method, `/v1${path}`, response.status, parsed);
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
  /** A settlement in cash, recorded by its payee (request 12). */
  const cash = (payee: Person, groupId: string, from: Person, amount: number) =>
    create(`/groups/${groupId}/settlements/cash`, payee.token, { from: from.id, amount });
  /** A settlement through the provider, asked for by its payer (request 13). */
  const payThrough = (payer: Person, groupId: string, to: Person, amount: number) =>
    create(`/groups/${groupId}/settlements/provider`, payer.token, { to: to.id, amount });
  /** A settlement, as `GET /v1/settlements/{id}` reads it (requests 12, 13, 15 and 19). */
  const settlement = (id: string, token: string) => read(`/settlements/${id}`, token);
  /** A person's notices, the most recent first (requests 17, 18 and 24). */
  const notices = (token: string) => list('/notices', token);
  /**
   * A file sent as the body of a command, `Content-Type: application/octet-stream`, followed to its outcome as `act`
   * follows any command (request 26). A server may refuse a file over its limit before reading it: it answers `413`
   * and closes the connection while the file is still being sent; whether the client reads that `413` or meets the
   * closed connection (`EPIPE`, `ECONNRESET`) is a race, and the file was refused either way.
   */
  const upload = async (method: string, path: string, token: string | undefined, bytes: Uint8Array) => {
    try {
      return await act(method, path, token, bytes);
    } catch (error) {
      const code = (error as { cause?: { code?: string } }).cause?.code;
      if (code !== 'EPIPE' && code !== 'ECONNRESET') throw error;
      return { accepted: false, result: undefined, later: false, status: 413 } as Outcome;
    }
  };
  /** A read answered as text, with its `Content-Type` (request 29's CSV), held to the API as any answer. */
  const raw = async (path: string, token?: string) => {
    const response = await fetch(`${origin}/v1${path}`, {
      headers: { ...(token && { authorization: `Bearer ${token}` }) },
    });
    const text = await response.text();
    if (held && response.status === 200) holdToApi('GET', `/v1${path}`, response.status, text);
    return { status: response.status, type: response.headers.get('content-type') ?? '', text };
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
    cash,
    payThrough,
    settlement,
    notices,
    upload,
    raw,
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

/** A payment the provider made for Tally (request 13): what Tally asked, and what the provider answered. */
export interface ProviderPayment {
  id: string;
  payUrl: string;
  body: Json;
}

/**
 * The payment provider (requests 13 to 16), an outside system the tests play: an HTTP server of its own that makes
 * payments (`POST /payments`), refunds them (`POST /payments/{id}/refunds`) and knows payout accounts
 * (`GET /accounts/{id}`), and the webhooks it sends Tally, signed with the secret the server is started with
 * (`environment()`). A test sends each webhook itself, when it chooses: late, twice, out of order. While `refusing`,
 * it answers every request with 503, as a provider that is down. From request 38 it says its fee on each payment it
 * makes (`state.fee`, 0 unless a test sets it; `null` leaves it out of its answer).
 */
export function paymentProvider() {
  const secret = `whsec-${randomBytes(16).toString('hex')}`;
  const payments: ProviderPayment[] = [];
  const refunds: { paymentId: string; body: Json }[] = [];
  const accountsAsked: string[] = [];
  const accounts = new Set<string>();
  const state: { refusing: boolean; fee: number | null } = { refusing: false, fee: 0 };
  const server: Server = createHttpServer((request, response) => {
    let raw = '';
    request.on('data', chunk => (raw += chunk));
    request.on('end', () => {
      let body: Json = {};
      try {
        body = raw ? (JSON.parse(raw) as Json) : {};
      } catch {
        // a body the provider cannot read is kept empty
      }
      const answer = (status: number, json?: unknown) =>
        response
          .writeHead(status, json === undefined ? {} : { 'content-type': 'application/json' })
          .end(json === undefined ? undefined : JSON.stringify(json));
      const path = (request.url ?? '').split('?')[0];
      if (request.method === 'GET' && path.startsWith('/accounts/')) {
        const id = decodeURIComponent(path.slice('/accounts/'.length));
        accountsAsked.push(id);
        if (state.refusing) return answer(503);
        return accounts.has(id) ? answer(200, { id }) : answer(404);
      }
      if (state.refusing) return answer(503);
      if (request.method === 'POST' && path === '/payments') {
        const id = `pay_${randomBytes(8).toString('hex')}`;
        const payment = { id, payUrl: `https://provider.test/pay/${id}`, body };
        payments.push(payment);
        return answer(201, { id: payment.id, payUrl: payment.payUrl, ...(state.fee !== null && { fee: state.fee }) });
      }
      const refund = /^\/payments\/([^/]+)\/refunds$/.exec(path);
      if (request.method === 'POST' && refund) {
        const paymentId = decodeURIComponent(refund[1]);
        if (!payments.some(payment => payment.id === paymentId)) return answer(404);
        refunds.push({ paymentId, body });
        return answer(201, { id: `re_${randomBytes(8).toString('hex')}` });
      }
      return answer(404);
    });
  });
  const listening = new Promise<string>(resolve =>
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(server.address() as { port: number }).port}`)),
  );
  /** The signature of a body, as the provider signs it: HMAC-SHA256, the secret as the key, in lowercase hex. */
  const sign = (text: string, key = secret) => createHmac('sha256', key).update(text).digest('hex');
  return {
    secret,
    payments,
    refunds,
    accounts,
    accountsAsked,
    state,
    sign,
    /** What a server is started with to use this provider (request 13). */
    environment: async () => ({ PROVIDER_URL: await listening, PROVIDER_WEBHOOK_SECRET: secret }),
    /** The payment Tally asked for a settlement: its `reference` is the settlement's id. */
    paymentFor: (settlementId: string) => {
      const payment = payments.find(each => each.body.reference === settlementId);
      if (!payment) throw new Error(`the provider was never asked to pay settlement ${settlementId}`);
      return payment;
    },
    /**
     * A webhook about a payment, signed, sent to the server `api` talks to and followed to its outcome (request 13):
     * `status` is the payment's, `id` the webhook's own (a new one unless given, to send the same webhook again).
     */
    webhook: (api: Client, paymentId: string, status: string, id: string = randomUUID()) => {
      const body = { id, paymentId, status, at: new Date().toISOString() };
      return api.act('POST', '/provider/webhooks', undefined, body, {
        'provider-signature': sign(JSON.stringify(body)),
      });
    },
    close: () => new Promise<void>(resolve => server.close(() => resolve())),
  };
}

export type PaymentProvider = ReturnType<typeof paymentProvider>;

/**
 * Makes `person` payable through the provider, once request 16 requires a payout account to be paid through it: the
 * provider knows an account of theirs, and they set it. Before request 16 nothing is needed, and the route does not
 * exist yet, so nothing is done (the README's superseded cases).
 */
export async function payable(api: Client, person: Person, provider: PaymentProvider) {
  if (!reached(16)) return;
  const accountId = `acct_${person.id}`;
  provider.accounts.add(accountId);
  await api.done('PUT', '/accounts/me/payout-account', person.token, { accountId });
}

/** An ISO time in milliseconds, for the tests that compare two of them. */
export const ms = (time: unknown) => new Date(String(time)).getTime();

/** A test's own HTTP server, as an outside system (requests 13, 22 and 26): its base URL once it listens. */
function outside(handle: (request: IncomingMessage, body: Buffer, response: ServerResponse) => void) {
  const server: Server = createHttpServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', chunk => chunks.push(chunk as Buffer));
    request.on('end', () => handle(request, Buffer.concat(chunks), response));
  });
  const listening = new Promise<string>(resolve =>
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(server.address() as { port: number }).port}`)),
  );
  return { listening, close: () => new Promise<void>(resolve => server.close(() => resolve())) };
}

const json = (response: ServerResponse, status: number, body?: unknown) =>
  response
    .writeHead(status, body === undefined ? {} : { 'content-type': 'application/json' })
    .end(body === undefined ? undefined : JSON.stringify(body));

/**
 * The rates service (request 22), an outside system the tests play: `GET /rates/{from}/{to}?date=` answers the rate a
 * test set for that day (`set(from, to, rate, date)`), or for any day (`set(from, to, rate)`), and `404` for one it
 * has none of. It records what Tally asked (`asked`); while `refusing`, it answers `503`, as a service that is down.
 */
export function ratesService() {
  const rates = new Map<string, string>();
  const asked: { from: string; to: string; date: string }[] = [];
  const state = { refusing: false };
  const server = outside((request, _body, response) => {
    const url = new URL(request.url ?? '/', 'http://rates.test');
    const match = /^\/rates\/([^/]+)\/([^/]+)$/.exec(url.pathname);
    if (request.method !== 'GET' || !match) return json(response, 404);
    const [from, to, date] = [
      decodeURIComponent(match[1]),
      decodeURIComponent(match[2]),
      url.searchParams.get('date') ?? '',
    ];
    asked.push({ from, to, date });
    if (state.refusing) return json(response, 503);
    const rate = rates.get(`${from}/${to}/${date}`) ?? rates.get(`${from}/${to}`);
    return rate === undefined ? json(response, 404) : json(response, 200, { rate });
  });
  return {
    rates,
    asked,
    state,
    /** The rate of `from` to `to` on `date`, or on any day when `date` is not given. */
    set: (from: string, to: string, rate: string, date?: string) =>
      rates.set(date === undefined ? `${from}/${to}` : `${from}/${to}/${date}`, rate),
    /** What a server is started with to use this service (request 22). */
    environment: async () => ({ RATES_URL: await server.listening }),
    close: server.close,
  };
}

export type RatesService = ReturnType<typeof ratesService>;

/**
 * The receipts store (request 26), an outside system the tests play: `POST /files` keeps the body as sent, with its
 * `Content-Type`, and answers `201 { id, url }`; `GET /files/{id}` gives the file back. It records every file it was
 * sent (`files`); while `refusing`, it answers `503`, as a store that is down.
 */
export function receiptStore() {
  const files: { id: string; type: string; bytes: Buffer; url: string }[] = [];
  const state = { refusing: false };
  let base = '';
  const server = outside((request, body, response) => {
    const path = (request.url ?? '').split('?')[0];
    if (request.method === 'GET' && path.startsWith('/files/')) {
      const file = files.find(each => each.id === decodeURIComponent(path.slice('/files/'.length)));
      if (!file) return json(response, 404);
      return response.writeHead(200, { 'content-type': file.type }).end(file.bytes);
    }
    if (request.method !== 'POST' || path !== '/files') return json(response, 404);
    if (state.refusing) return json(response, 503);
    const id = `file_${randomBytes(8).toString('hex')}`;
    const file = { id, type: String(request.headers['content-type'] ?? ''), bytes: body, url: `${base}/files/${id}` };
    files.push(file);
    return json(response, 201, { id, url: file.url });
  });
  void server.listening.then(url => (base = url));
  return {
    files,
    state,
    /** What a server is started with to use this store (request 26). */
    environment: async () => ({ RECEIPTS_URL: await server.listening }),
    close: server.close,
  };
}

export type ReceiptStore = ReturnType<typeof receiptStore>;

/**
 * The smallest files of each type request 26 tells apart by their first bytes: a 1×1 JPEG (`FF D8 FF`), a 1×1 PNG
 * (`89 50 4E 47 0D 0A 1A 0A`), and a one-page PDF (`%PDF-`), which is neither.
 */
export const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAFA3PEY8MlBGQUZaVVBfeMiCeG5uePWvuZHI////////////////////////////////////////////////////' +
    'wAALCAABAAEBAREA/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEI' +
    'I0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ip' +
    'qrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oACAEBAAA/ALtf/9k=',
  'base64',
);
export const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGP4DwABAQEAsTj2FAAAAABJRU5ErkJggg==',
  'base64',
);
export const PDF = Buffer.from(
  '%PDF-1.0\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 3 3]>>endobj\nxref\n0 4\n0000000000 65535 f \n' +
    '0000000009 00000 n \n0000000052 00000 n \n0000000101 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n160\n%%EOF\n',
);
/** `bytes` followed by zeros up to `size` bytes: a file of a type at a size limit (2 097 152 bytes, 2 097 153). */
export const padded = (bytes: Uint8Array, size: number) => {
  const file = Buffer.alloc(size);
  Buffer.from(bytes).copy(file, 0, 0, Math.min(bytes.length, size));
  return file;
};

/** The same day `months` later (request 23's days, 1 to 28, which every month has). */
export const monthsFrom = (date: string, months: number) => {
  const [year, month, dayOfMonth] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1 + months, dayOfMonth)).toISOString().slice(0, 10);
};

/**
 * A recurring expense's `startsOn` about `days` from today (negative: before), moved back to the 28th when it falls
 * later in its month, and every day of it, month by month, up to today (request 23).
 */
export function monthly(days: number) {
  const startsOn = day(days);
  const first = Number(startsOn.slice(8)) > 28 ? `${startsOn.slice(0, 8)}28` : startsOn;
  const passed: string[] = [];
  for (let next = first; next <= day(0); next = monthsFrom(next, 1)) passed.push(next);
  return { startsOn: first, passed, next: monthsFrom(first, passed.length) };
}
