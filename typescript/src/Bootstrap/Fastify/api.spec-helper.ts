import { existsSync } from 'fs';
import { join } from 'path';

/** An answer, as a test reads it: its status, its body parsed (or its text, or nothing), its headers. */
export interface ApiAnswer {
  status: number;
  body: unknown;
  headers: Headers;
}

/** What the end-to-end client asks of the tooling's composer (`clean-ddd/api`, ADR 45 of the reference). */
interface Composer {
  loadApplicationApi(root: string): unknown;
  holdAnswer(api: unknown, answer: { method: string; path: string; status: number; body: unknown }): void;
}

/**
 * The application's API, as its `api/` fragments compose it, read once per suite by the tooling that
 * composes them; nothing where the tree has no `api/` (the reference's own tree, which the scenario
 * every language answers holds from outside instead). A fragment that does not compose fails the suite.
 */
let composed: Promise<{ composer: Composer; api: unknown } | undefined> | undefined;
const composedApi = () =>
  (composed ??= (async () => {
    const root = process.cwd();
    if (!existsSync(join(root, 'api'))) return undefined;
    const tooling: string = 'clean-ddd/api';
    const composer = (await import(tooling)) as Composer;
    return { composer, api: composer.loadApplicationApi(root) };
  })());

/**
 * The client every end-to-end suite speaks to the application through, over HTTP as any client would:
 * every answer it reads is held to the API `api/` gives, before the test sees it. An answer of another
 * shape, a status its route and `all_routes` do not name, or a route no fragment declares, fails the
 * test that read it, naming the fragment whose shape it breaks: the answer is changed where the
 * request's API says, or the fragment first, never the test alone.
 *
 *   const http = apiClient(app.address);
 *   const { status, body } = await http.request('GET', `/${app.apiPrefix}/things/${id}`, { token });
 *
 * `path` is the whole path, the prefix included, as the fragments write it.
 */
export function apiClient(origin: string) {
  const request = async (
    method: string,
    path: string,
    { body, token, headers = {} }: { body?: unknown; token?: string; headers?: Record<string, string> } = {},
  ): Promise<ApiAnswer> => {
    const response = await fetch(`${origin}${path}`, {
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
    const held = await composedApi();
    held?.composer.holdAnswer(held.api, { method, path, status: response.status, body: parsed });
    return { status: response.status, body: parsed, headers: response.headers };
  };
  return {
    request,
    get: (path: string, options?: { token?: string; headers?: Record<string, string> }) =>
      request('GET', path, options),
  };
}
