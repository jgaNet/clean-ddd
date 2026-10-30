import { FastifyApplication } from '@Bootstrap/Fastify/FastifyApplication';
import { createApplication } from '@Bootstrap/Fastify/createApplication';

/**
 * What every acceptance test of the benchmark shares: the whole application over HTTP, as a
 * client sees it, from the composition root the project has. Copied beside the tests into
 * `src/Bootstrap/Fastify/Acceptance/`; never run by `test:e2e`.
 */
export type Json = Record<string, unknown>;
export interface Response {
  status: number;
  body: Json;
}

export interface Client {
  call(method: string, path: string, token?: string, body?: Json): Promise<Response>;
  /** What a command came to: the 202's operation, followed until it ends. */
  outcome(accepted: Response, token?: string): Promise<Json>;
  /** A command sent and followed: its outcome's status, `SUCCESS` or `ERROR`. */
  command(method: string, path: string, token?: string, body?: Json): Promise<string>;
  /** A signed-up, logged-in account. */
  account(email: string): Promise<{ id: string; token: string }>;
  /** A note written by that token, its id. */
  note(token: string, title: string, text?: string): Promise<string>;
  /** A list the API answers, or the status it answered instead. */
  list(path: string, token?: string): Promise<Json[]>;
}

export function acceptance(): { client: () => Client; stop: () => Promise<void> } {
  // One application per test file, started by the first request, however many arrive at once.
  let started: Promise<{ app: FastifyApplication; api: string }> | undefined;
  const start = () =>
    (started ??= (async () => {
      const app = await createApplication();
      await app.start(0);
      return { app, api: `${app.address}/${app.apiPrefix}` };
    })());

  const call: Client['call'] = async (method, path, token, body) => {
    const { api } = await start();
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
  const outcome: Client['outcome'] = async (accepted, token) => {
    expect(accepted.status).toBe(202);
    for (let attempt = 0; attempt < 100; attempt++) {
      const { body } = await call('GET', `/tracker/operations/${accepted.body.operationId}`, token);
      if (body?.status === 'SUCCESS' || body?.status === 'ERROR') return body;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error('the operation never ended');
  };
  const command: Client['command'] = async (method, path, token, body) =>
    String((await outcome(await call(method, path, token, body), token)).status);
  const account: Client['account'] = async email => {
    const signedUp = await outcome(await call('POST', '/accounts', undefined, { email, password: 'secret123' }));
    expect(signedUp.status).toBe('SUCCESS');
    const login = await call('POST', '/accounts/login', undefined, { email, password: 'secret123' });
    expect(login.status).toBe(200);
    return { id: String(signedUp.result), token: String(login.body.token) };
  };
  const note: Client['note'] = async (token, title, text = '') => {
    const written = await outcome(await call('POST', '/notes', token, { title, text }), token);
    expect(written.status).toBe('SUCCESS');
    return String(written.result);
  };

  const list: Client['list'] = async (path, token) => {
    const { status, body } = await call('GET', path, token);
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    return body as unknown as Json[];
  };

  const client = { call, outcome, command, account, note, list };
  return { client: () => client, stop: async () => (started ? (await started).app.stop() : undefined) };
}

/** A reaction runs after the command's outcome: read until the answer is the expected one, or give up. */
export async function eventually<T>(read: () => Promise<T>, expected: (value: T) => boolean, tries = 100): Promise<T> {
  let value = await read();
  for (let attempt = 0; attempt < tries && !expected(value); attempt++) {
    await new Promise(resolve => setTimeout(resolve, 20));
    value = await read();
  }
  return value;
}

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
