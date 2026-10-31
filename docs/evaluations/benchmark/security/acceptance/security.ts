import { ChildProcess, spawn } from 'child_process';
import { createHmac } from 'crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'fs';
import { createServer } from 'net';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * What the security audit's probes share (docs/evaluations/benchmark/security): the server runs as
 * a process of its own, from the entry point the grader names (ACCEPTANCE_ENTRY), on a SQLite file
 * of its own (DATABASE_PATH), so that a probe can read what the server keeps at rest. Nothing here
 * knows how a tree is written: every probe goes through the API of features 1–7, as a client would.
 */
export type Json = Record<string, unknown>;
export interface Answer {
  status: number;
  body: Json;
  text: string;
}

const entry = process.env.ACCEPTANCE_ENTRY ?? 'src/Bootstrap/Fastify/application.ts';

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const freePort = () =>
  new Promise<number>(resolve => {
    const server = createServer().listen(0, () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
  });

async function start(port: number, database: string): Promise<{ child: ChildProcess; exited: Promise<void> }> {
  const child = spawn('npx', ['tsx', '--tsconfig', './tsconfig.json', entry], {
    env: { ...process.env, PORT: String(port), DATABASE_PATH: database, NODE_ENV: 'production' },
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

/** A server of the tree under audit, on a database of its own, with a client of its API. */
export async function server(name: string) {
  const directory = mkdtempSync(join(tmpdir(), `security-${name}-`));
  const database = join(directory, 'audit.sqlite');
  const port = await freePort();
  const running = await start(port, database);
  const close = async () => {
    try {
      process.kill(-running.child.pid!, 'SIGTERM');
      let timer: NodeJS.Timeout | undefined;
      await Promise.race([running.exited, new Promise(resolve => (timer = setTimeout(resolve, 5000)))]);
      clearTimeout(timer);
      process.kill(-running.child.pid!, 'SIGKILL');
    } catch {
      // already gone
    }
    await running.exited;
    rmSync(directory, { recursive: true, force: true });
  };
  return { ...client(port), directory, close };
}

export function client(port: number) {
  const api = `http://127.0.0.1:${port}/v1`;
  /** A request as a client sends it; `raw` sends a body exactly as given (or none), with its own headers. */
  const call = async (
    method: string,
    path: string,
    token?: string,
    body?: unknown,
    raw?: { body?: string; headers: Record<string, string> },
  ): Promise<Answer> => {
    const response = await fetch(`${api}${path}`, {
      method,
      headers: {
        ...(body !== undefined && { 'content-type': 'application/json' }),
        ...(token !== undefined && { authorization: `Bearer ${token}` }),
        ...raw?.headers,
      },
      body: raw ? raw.body : body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let parsed: unknown = undefined;
    try {
      parsed = text ? JSON.parse(text) : undefined;
    } catch {
      parsed = text;
    }
    return { status: response.status, body: parsed as Json, text };
  };
  /** What a command came to: the 202's operation, followed until it ends. */
  const outcome = async (accepted: Answer, token?: string): Promise<Json> => {
    expect(accepted.status).toBe(202);
    for (let attempt = 0; attempt < 400; attempt++) {
      const { body } = await call('GET', `/tracker/operations/${accepted.body.operationId}`, token);
      if (body?.status === 'SUCCESS' || body?.status === 'ERROR') return body;
      await sleep(25);
    }
    throw new Error('the operation never ended');
  };
  const command = async (method: string, path: string, token?: string, body?: Json) =>
    outcome(await call(method, path, token, body), token);
  const login = async (email: string, password = 'secret123') => {
    const answer = await call('POST', '/accounts/login', undefined, { email, password });
    expect(answer.status).toBe(200);
    return String(answer.body.token);
  };
  const account = async (email: string, password = 'secret123') => {
    const signedUp = await command('POST', '/accounts', undefined, { email, password });
    expect(signedUp.status).toBe('SUCCESS');
    return { id: String(signedUp.result), email, token: await login(email, password) };
  };
  const note = async (token: string, title: string, text = '') => {
    const written = await command('POST', '/notes', token, { title, text });
    expect(written.status).toBe('SUCCESS');
    return String(written.result);
  };
  /** The note as its owner reads it. */
  const read = async (token: string, id: string) => {
    const answer = await call('GET', `/notes/${id}`, token);
    expect(answer.status).toBe(200);
    return answer.body;
  };
  const ids = async (path: string, token: string) => {
    const answer = await call('GET', path, token);
    expect(answer.status).toBe(200);
    return (answer.body as unknown as Json[]).map(each => String(each.id ?? each.noteId));
  };
  /**
   * Whether a request was refused: a 4xx, or a 202 whose operation ends in ERROR. A 5xx is not a
   * refusal, it is a server that broke; the probe that meets one says so.
   */
  const refused = async (method: string, path: string, token?: string, body?: Json) => {
    const answer = await call(method, path, token, body);
    if (answer.status >= 500)
      throw new Error(`${method} ${path} answered ${answer.status}: ${answer.text.slice(0, 200)}`);
    if (answer.status >= 400) return true;
    if (answer.status !== 202) return false;
    return (await outcome(answer, token)).status === 'ERROR';
  };
  return { call, outcome, command, login, account, note, read, ids, refused };
}

/** Every key of a JSON value, at any depth. */
export function keys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(keys);
  if (value && typeof value === 'object')
    return Object.entries(value).flatMap(([key, nested]) => [key, ...keys(nested)]);
  return [];
}

/** Every file under a directory, its bytes: what the server keeps at rest. */
export function filesUnder(directory: string): { path: string; bytes: Buffer }[] {
  return readdirSync(directory).flatMap(name => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [{ path, bytes: readFileSync(path) }];
  });
}

/** The ways a secret can sit readable in a file: as text, in base64, in hex, in UTF-16. */
export function readableForms(secret: string): Buffer[] {
  return [
    Buffer.from(secret, 'utf8'),
    Buffer.from(Buffer.from(secret).toString('base64')),
    Buffer.from(Buffer.from(secret).toString('hex')),
    Buffer.from(secret, 'utf16le'),
  ];
}

/** Secrets a server may have been left with: a default, a placeholder, an empty one. */
const GUESSABLE_SECRETS = [
  '',
  'secret',
  'changeme',
  'change-me',
  'dev',
  'development',
  'test',
  'jwt-secret',
  'token-secret',
];

/**
 * Tokens an attacker can make from their own token, aiming at another account. A segment of the
 * token that decodes to JSON naming the attacker is rewritten to name the other account, then
 * sent with the old signature, with none (`alg: none`), and signed again with a guessable secret.
 * A token with no such segment (an opaque one) gets only the rewrites that need no reading.
 */
export function forgeries(token: string, own: string, other: string): { name: string; token: string }[] {
  const changed = (at: number) => token.slice(0, at) + (token[at] === 'A' ? 'B' : 'A') + token.slice(at + 1);
  const forged = [
    { name: 'garbage', token: 'not-a-token' },
    { name: 'a character changed in the middle', token: changed(Math.floor(token.length / 2)) },
    { name: 'a character changed near the end', token: changed(Math.max(0, token.length - 10)) },
    { name: 'truncated', token: token.slice(0, Math.max(1, token.length - 6)) },
  ];
  const parts = token.split('.');
  parts.forEach((part, index) => {
    let decoded: string;
    try {
      decoded = Buffer.from(part, 'base64url').toString('utf8');
      JSON.parse(decoded);
    } catch {
      return;
    }
    if (!decoded.includes(own)) return;
    const rewritten = Buffer.from(decoded.split(own).join(other)).toString('base64url');
    const withPart = (replacement: string) => parts.map((each, i) => (i === index ? replacement : each));
    forged.push({ name: `segment ${index + 1} rewritten, signature kept`, token: withPart(rewritten).join('.') });
    if (parts.length === 3) {
      const none = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
      forged.push({ name: 'rewritten, alg none', token: `${none}.${withPart(rewritten)[1]}.` });
    }
    for (const secret of GUESSABLE_SECRETS) {
      const unsigned = withPart(rewritten).slice(0, -1).join('.');
      for (const encoding of ['base64url', 'hex'] as const) {
        const signature = createHmac('sha256', secret).update(unsigned).digest(encoding);
        forged.push({ name: `rewritten, signed with '${secret}' (${encoding})`, token: `${unsigned}.${signature}` });
      }
    }
  });
  return forged;
}

/** What an answer must never show a client: a stack, a source file, a query, the store's errors. */
export const INTERNALS = /\bat \S+ \(|\.ts:\d+|node_modules|SQLITE_|\bSELECT\b.*\bFROM\b|\bINSERT INTO\b|"stack"/i;
