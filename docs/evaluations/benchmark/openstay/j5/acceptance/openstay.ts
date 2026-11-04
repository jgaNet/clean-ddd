import { ChildProcess, execFileSync, spawn } from 'child_process';
import { createHmac, randomInt } from 'crypto';
import { mkdtempSync, rmSync } from 'fs';
import { createServer as createHttpServer, Server } from 'http';
import { createServer } from 'net';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * What OpenStay's hidden tests share (docs/evaluations/benchmark/openstay). The server runs as a
 * process of its own, from the entry point the grader names (ACCEPTANCE_ENTRY), on a SQLite file of
 * its own (DATABASE_PATH) and a PostgreSQL database of its own (DATABASE_URL, from request 40 on: a
 * tree uses the one it knows), so that a test can stop it, kill it the way a power cut would, start it
 * again on the same store, or start a second one beside it. Nothing here knows how a tree is
 * written: every test goes through the API the requests give, and a command may answer at once or
 * later (request 1), so the client below reads both.
 *
 * From J5 (requests 51 to 100) it also has: `restart` and `clock` (a server moved some days ahead,
 * request 57), `adminEnvironment` and `client().admin` (request 37's administrators), the notices of
 * any kind (`notificationService().notices`), outside calendars (`calendarServer`, `ics`) and the
 * reading of an exported one (`parseCalendar`), files (`PDF`, `JPEG`, `PNG`, `padded`, and the client's
 * `upload` and `download`), TOTP codes (`totp`), IBANs (`iban`, `INVALID_IBAN`), and reads with headers
 * of their own whose answer's headers can be read (`readWith`, `readIn`).
 */
export type Json = Record<string, unknown>;
export interface Answer {
  status: number;
  body: Json;
}

const entry = process.env.ACCEPTANCE_ENTRY ?? 'src/Bootstrap/Fastify/application.ts';
export const PASSWORD = 'secret-password';

/** The administrator's email `adminEnvironment()` lists and `client().admin()` signs up, when none is given. */
export const ADMIN_EMAIL = 'admin@openstay.test';
/**
 * The variable that makes the accounts with these emails administrators (request 37: `ADMIN_EMAILS`,
 * a comma-separated list), `ADMIN_EMAIL` when none is given. An administrator is then an account
 * signed up with one of them: `api.admin()`, as test 37 signs up `ada@reconciliation.test`.
 */
export const adminEnvironment = (...emails: string[]) => ({
  ADMIN_EMAILS: (emails.length ? emails : [ADMIN_EMAIL]).join(','),
});

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

/** The PostgreSQL server the kit runs (J4): one database per test file is created on it. */
export const POSTGRES = process.env.OPENSTAY_POSTGRES ?? 'postgresql://postgres@127.0.0.1:55432';
const urls = new Map<string, string>();
const psql = (sql: string, url = `${POSTGRES}/postgres`) =>
  execFileSync('psql', [url, '-v', 'ON_ERROR_STOP=1', '-tAc', sql], { encoding: 'utf8' }).trim();

/**
 * A database of its own: a SQLite file in a directory, and a PostgreSQL database, both removed with
 * `remove()`. `start(path)` gives the server both, and a tree uses the one it knows.
 */
export function database(name: string) {
  const directory = mkdtempSync(join(tmpdir(), `openstay-${name}-`));
  const path = join(directory, 'openstay.sqlite');
  const pg = `openstay_${name.replace(/[^a-z0-9]/gi, '_')}_${process.pid}_${Date.now()}`.toLowerCase();
  psql(`CREATE DATABASE ${pg}`);
  const url = `${POSTGRES}/${pg}`;
  urls.set(path, url);
  return {
    path,
    url,
    /** What the PostgreSQL database holds: the number of rows in all its tables (request 40). */
    rows: () =>
      Number(
        psql(
          `SELECT coalesce(sum((xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I', table_schema, table_name), false, true, '')))[1]::text::int), 0) FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog', 'information_schema') AND table_type = 'BASE TABLE'`,
          url,
        ) || 0,
      ),
    tables: () => Number(psql(`SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'`, url)),
    remove: () => {
      rmSync(directory, { recursive: true, force: true });
      try {
        psql(`DROP DATABASE IF EXISTS ${pg} WITH (FORCE)`);
      } catch {
        // a database a server still holds is dropped with the next run's cleanup
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
let away = false;
async function awayFromMidnight() {
  // Once per test file, at its first start: a restart in the middle of a case must not wait. The
  // grader also waits before a file that would start in the last ten minutes of a day (J4), since a
  // file with crashes in it runs for a few minutes.
  if (away) return;
  away = true;
  const now = new Date();
  const left = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - now.getTime();
  if (left < 180_000) await sleep(left + 5000);
}

/**
 * Starts a server on `path`, with `environment` added, and waits until it answers anything. Any
 * variable a request names goes in `environment`: `{ NOTIFY_URL, JOBS_INTERVAL_SECONDS: '1',
 * ...adminEnvironment(), ...clock(15), ...(await provider.environment()) }`.
 */
export async function start(path: string, environment: Record<string, string> = {}): Promise<Running> {
  await awayFromMidnight();
  const port = await freePort();
  const child = spawn('npx', ['tsx', '--tsconfig', './tsconfig.json', entry], {
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_PATH: path,
      ...(urls.has(path) && { DATABASE_URL: urls.get(path) }),
      NODE_ENV: 'production',
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

/**
 * OpenStay's date moved `days` ahead (request 57): the variable a server is started with so that its
 * today is `day(days)`. Servers on one database run with the same offset.
 */
export const clock = (days: number) => ({ CLOCK_OFFSET_DAYS: String(days) });

/**
 * Stops `running` and starts a server again on the same database `path`, with `environment`: with
 * `clock(days)` in it, the same store `days` later (request 57). A provider is attached again to the
 * new port (`provider.attach(server.port)`), and a client made for it (`client(server.port)`).
 */
export async function restart(
  running: Running,
  path: string,
  environment: Record<string, string> = {},
): Promise<Running> {
  await stop(running);
  return start(path, environment);
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
  const origin = `http://127.0.0.1:${port}`;
  const api = `${origin}/v1`;
  /**
   * One request as it went, with the answer's status, headers and bytes. A path is under `/v1`
   * (`/listings`), unless it already starts with `/v1/`: an address the server gave whole, from its
   * root (request 95's `url`). A `Uint8Array` (a `Buffer`) body is sent as it is, as
   * `application/octet-stream` unless `headers` say otherwise (requests 54, 73); any other, as JSON.
   */
  const exchange = async (
    method: string,
    path: string,
    token?: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<{ status: number; headers: Headers; bytes: Buffer }> => {
    // `isView` rather than `instanceof`: a Buffer may come from another realm than the test's.
    const raw = ArrayBuffer.isView(body);
    const response = await fetch(path.startsWith('/v1/') ? `${origin}${path}` : `${api}${path}`, {
      method,
      headers: {
        ...(body !== undefined && { 'content-type': raw ? 'application/octet-stream' : 'application/json' }),
        ...(token && { authorization: `Bearer ${token}` }),
        ...headers,
      },
      body:
        body === undefined
          ? undefined
          : raw
            ? new Blob([new Uint8Array(body.buffer, body.byteOffset, body.byteLength).slice()])
            : JSON.stringify(body),
    });
    return { status: response.status, headers: response.headers, bytes: Buffer.from(await response.arrayBuffer()) };
  };
  const parse = (text: string) => {
    let parsed: unknown = undefined;
    try {
      parsed = text ? JSON.parse(text) : undefined;
    } catch {
      parsed = text;
    }
    return parsed as Json;
  };
  const call = async (
    method: string,
    path: string,
    token?: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<Answer> => {
    const { status, bytes } = await exchange(method, path, token, body, headers);
    return { status, body: parse(bytes.toString('utf8')) };
  };
  /**
   * A read with headers of its own, whatever its status, and the answer's headers: an
   * `Accept-Language` (request 85), the `X-Order` a search answers (request 62, `headers.get('x-order')`).
   */
  const readWith = async (path: string, token?: string, headers: Record<string, string> = {}) => {
    const answer = await exchange('GET', path, token, undefined, headers);
    return { status: answer.status, body: parse(answer.bytes.toString('utf8')), headers: answer.headers };
  };
  /** A read asked with `Accept-Language: language` (requests 85, 86). */
  const readIn = (path: string, language: string, token?: string) =>
    readWith(path, token, { 'accept-language': language });
  /** A file as the server gives it: its status, its `Content-Type` and its bytes (requests 54, 73, 95). */
  const download = async (path: string, token?: string) => {
    const answer = await exchange('GET', path, token);
    return { status: answer.status, type: answer.headers.get('content-type') ?? '', bytes: answer.bytes };
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
  /**
   * A raw file sent as the body of a command, `Content-Type: application/octet-stream`, its name in
   * `?name=` (left out when `name` is undefined), followed to its outcome as `act` follows any
   * command: `api.upload(`/conversations/${id}/attachments`, token, PDF, 'plan.pdf')` (requests 54, 73).
   */
  const upload = (path: string, token: string | undefined, bytes: Uint8Array, name?: string) =>
    act(
      'POST',
      name === undefined ? path : `${path}${path.includes('?') ? '&' : '?'}name=${encodeURIComponent(name)}`,
      token,
      bytes,
    );
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
  /**
   * An administrator (request 37): an account whose email the server was started with in
   * `ADMIN_EMAILS` (`adminEnvironment(email)`), a traveller unless `roles` say otherwise.
   */
  const admin = (email = ADMIN_EMAIL, roles: string[] = ['traveller']) => account(email, roles);

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
    exchange,
    readWith,
    readIn,
    download,
    upload,
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
    admin,
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
    /**
     * The notices accepted, whatever their body, in the order they were first accepted; those of one
     * `kind` when it is given (`message`, `email-verification`, `calendar-conflict`: requests 55, 76, 97).
     */
    notices: (kind?: string) => [...accepted.values()].filter(body => kind === undefined || body.kind === kind),
    close: () => new Promise<void>(resolve => server.close(() => resolve())),
  };
}

/**
 * Outside calendars a listing imports (requests 96, 97), served by the test: each `name` is an address,
 * `url(name)`, whose answer the test sets with `serve` and changes between sweeps. An address nothing
 * was served at answers `404`. `fetchesOf(name)` counts the `GET`s it received, to wait for a sweep.
 */
export function calendarServer() {
  const feeds = new Map<string, { status: number; body: string; delayMs: number; contentType: string }>();
  const fetches: { name: string; at: number }[] = [];
  const timers = new Set<NodeJS.Timeout>();
  const server: Server = createHttpServer((request, response) => {
    const name = decodeURIComponent((request.url ?? '/').slice(1).replace(/\.ics(\?.*)?$/, ''));
    fetches.push({ name, at: Date.now() });
    const feed = feeds.get(name);
    const reply = () =>
      feed
        ? response.writeHead(feed.status, { 'content-type': feed.contentType }).end(feed.body)
        : response.writeHead(404).end();
    if (!feed?.delayMs) {
      reply();
      return;
    }
    const timer = setTimeout(() => {
      timers.delete(timer);
      reply();
    }, feed.delayMs);
    timers.add(timer);
  });
  const listening = new Promise<string>(resolve =>
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(server.address() as { port: number }).port}`)),
  );
  return {
    /** The address of the calendar `name`. */
    url: async (name: string) => `${await listening}/${encodeURIComponent(name)}.ics`,
    /**
     * What `name` answers from now on: `body` (an `ics(...)` file, or anything else), with `status`
     * (200), after `delayMs` (0; more than 10,000 is a fetch that does not answer in time, request 96).
     */
    serve: (
      name: string,
      body: string,
      {
        status = 200,
        delayMs = 0,
        contentType = 'text/calendar',
      }: { status?: number; delayMs?: number; contentType?: string } = {},
    ) => feeds.set(name, { status, body, delayMs, contentType }),
    /** `name` answers `404` from now on. */
    remove: (name: string) => feeds.delete(name),
    fetches,
    fetchesOf: (name: string) => fetches.filter(each => each.name === name).length,
    close: () => {
      for (const timer of timers) clearTimeout(timer);
      server.closeAllConnections();
      return new Promise<void>(resolve => server.close(() => resolve()));
    },
  };
}
export type CalendarServer = ReturnType<typeof calendarServer>;

/** An event of an outside calendar: `from` its first night, `to` the day after its last (none: one night). */
export interface CalendarEvent {
  uid?: string;
  from: string;
  to?: string;
  summary?: string;
  /** Lines added inside the event as they are, to write what request 96 says is ignored. */
  extra?: string[];
}
const compact = (date: string) => date.replaceAll('-', '');
/**
 * An iCalendar file (RFC 5545) as another site serves it, with dates `YYYY-MM-DD` written
 * `DTSTART;VALUE=DATE:YYYYMMDD`; lines end with CRLF unless `eol` says `\n` (request 96 reads both).
 */
export function ics(events: CalendarEvent[], eol: '\r\n' | '\n' = '\r\n') {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Elsewhere//Calendar//EN'];
  for (const event of events)
    lines.push(
      'BEGIN:VEVENT',
      ...(event.uid === undefined ? [] : [`UID:${event.uid}`]),
      'DTSTAMP:20260101T000000Z',
      `DTSTART;VALUE=DATE:${compact(event.from)}`,
      ...(event.to === undefined ? [] : [`DTEND;VALUE=DATE:${compact(event.to)}`]),
      `SUMMARY:${event.summary ?? 'Reserved'}`,
      ...(event.extra ?? []),
      'END:VEVENT',
    );
  lines.push('END:VCALENDAR');
  return lines.join(eol) + eol;
}

/** An event of a calendar a server exported (request 95), its dates as the API writes them. */
export interface ExportedEvent {
  uid: string | undefined;
  dtstamp: string | undefined;
  /** The first night, `YYYY-MM-DD`, from `DTSTART;VALUE=DATE`; undefined when not written that way. */
  from: string | undefined;
  /** The day after the last night, `YYYY-MM-DD`, from `DTEND;VALUE=DATE`. */
  to: string | undefined;
  summary: string | undefined;
  /** Every property of the event, by its name with its parameters (`DTSTART;VALUE=DATE`). */
  properties: Record<string, string>;
}
const dashed = (value: string | undefined) =>
  value && /^\d{8}$/.test(value) ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6)}` : undefined;
/**
 * Reads an iCalendar file a server exported (request 95): whether every line ends with CRLF, its
 * lines (folded lines unfolded), the calendar's own properties, and its events in order.
 */
export function parseCalendar(text: string) {
  const crlf = text.endsWith('\r\n') && !/(^|[^\r])\n/.test(text);
  const lines = text
    .replace(/\r?\n[ \t]/g, '')
    .split(/\r?\n/)
    .filter(line => line !== '');
  const properties: Record<string, string> = {};
  const events: ExportedEvent[] = [];
  let current: Record<string, string> | undefined;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') current = {};
    else if (line === 'END:VEVENT' && current) {
      events.push({
        uid: current.UID,
        dtstamp: current.DTSTAMP,
        from: dashed(current['DTSTART;VALUE=DATE']),
        to: dashed(current['DTEND;VALUE=DATE']),
        summary: current.SUMMARY,
        properties: current,
      });
      current = undefined;
    } else {
      const colon = line.indexOf(':');
      if (colon < 0) continue;
      (current ?? properties)[line.slice(0, colon)] = line.slice(colon + 1);
    }
  }
  return { crlf, lines, properties, events };
}

/**
 * The smallest files of each type requests 54 and 73 accept, recognised by their first bytes: a
 * one-page PDF (`%PDF-`), a 1×1 JPEG (`FF D8 FF`) and a 1×1 PNG (`89 50 4E 47 0D 0A 1A 0A`), each
 * a file a reader opens.
 */
export const PDF = Buffer.from(
  '%PDF-1.0\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 3 3]>>endobj\nxref\n0 4\n0000000000 65535 f \n' +
    '0000000009 00000 n \n0000000052 00000 n \n0000000101 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n160\n%%EOF\n',
);
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
/** `bytes` followed by zeros up to `size` bytes: a file of a type at a size limit (5,242,880 bytes, 5,242,881). */
export const padded = (bytes: Uint8Array, size: number) => {
  const file = Buffer.alloc(size);
  Buffer.from(bytes).copy(file, 0, 0, Math.min(bytes.length, size));
  return file;
};

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
/** The bytes of a base32 secret (RFC 4648), padding, spaces and case ignored. */
export function base32Decode(secret: string): Buffer {
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (const char of secret.toUpperCase().replace(/[\s=]/g, '')) {
    const index = BASE32.indexOf(char);
    if (index < 0) throw new Error(`not base32: ${char}`);
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >> bits) & 0xff);
    }
  }
  return Buffer.from(bytes);
}
/**
 * The two-factor code of `secret` (base32, no padding) at `at` (ms since the epoch, now when not
 * given), as RFC 6238 makes it (request 77): HMAC-SHA-1, six digits, a step of 30 seconds. `steps`
 * moves to the step before (-1) or after (1). The machine's own clock, never `CLOCK_OFFSET_DAYS`.
 */
export function totp(secret: string, at = Date.now(), steps = 0): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000) + steps));
  const hmac = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(code).padStart(6, '0');
}

/** The remainder by 97 of an IBAN rearranged as request 69 says: 1 for a valid one. */
export const ibanRemainder = (value: string) => {
  const iban = value.replace(/\s/g, '').toUpperCase();
  const digits = (iban.slice(4) + iban.slice(0, 4)).replace(/[A-Z]/g, letter => String(letter.charCodeAt(0) - 55));
  let remainder = 0;
  for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
  return remainder;
};
/**
 * A new valid IBAN (request 69): `country`, its check digits, then `length - 4` random digits
 * (27 characters, a French one's length, when not given), upper-case, without spaces. Each call
 * gives another.
 */
export function iban(country = 'FR', length = 27): string {
  const bban = Array.from({ length: length - 4 }, () => String(randomInt(10))).join('');
  const check = 98 - ibanRemainder(`${country}00${bban}`);
  return `${country}${String(check).padStart(2, '0')}${bban}`;
}
/** An IBAN of the right shape whose check digits are wrong (request 69's example with its last digit changed). */
export const INVALID_IBAN = 'FR7630006000011234567890188';
/** An IBAN written in groups of four, as a person writes it: `FR76 3000 6000 0112 3456 7890 189`. */
export const spaced = (value: string) => value.replace(/(.{4})(?=.)/g, '$1 ');
