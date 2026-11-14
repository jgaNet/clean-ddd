/**
 * The API as data (ADR 45): fragments of JSON Schema, one per request or change, composed in order,
 * and an answer held to the composition. Every shape carries the request that set it, so a problem
 * names the request (the fragment) an answer departed from, not only the line of a test.
 *
 * Two readers, one composer:
 * - a benchmark kit's requests (`api/<n>-<id>.yaml`, numbered by the kit's backlog), composed up to a
 *   request for the grader and checked by kit-check (`.claude/flow/api-schema.mjs` is this module,
 *   under the names the flow has always used; docs/evaluations/benchmark/kit-standard.md);
 * - a created application's `api/` (`api/<n>-<name>.yaml`, numbered by the change that added it),
 *   which its end-to-end client holds every answer to and its conventions check refuses when it does
 *   not compose (API-ONE-SURFACE).
 *
 * A fragment says, for request n:
 *
 *   resources:                    # what the API answers, by name
 *     booking:
 *       schema: { … }             # a JSON Schema (draft-07): the resource, new or replaced whole
 *       gains: { payment: { … } } # properties it now has, required from this request on
 *       states:                   # values an enum property now takes, each read whole by a test
 *         - { field: status, add: [lapsed], test: "<the it, in this request's acceptance file>" }
 *       conditions:               # a property null in one case only
 *         - { field: payment, null_only_when: { status: [requested] } }
 *   all_routes:                   # what any route may answer besides its own: a status, or a class (4xx)
 *     '4xx': {}
 *   routes:
 *     GET /v1/bookings/{id}:
 *       200: booking              # a resource's name, or a JSON Schema; `{ $resource: name }` anywhere inside one
 *
 * A route answered with a status neither it nor `all_routes` names is refused, once a fragment has
 * declared `all_routes`: a 5xx is never an answer a request gives.
 *
 * It imports packages only (and types), so that the flow's scripts load it from source as they are,
 * and the package ships it as `clean-ddd/api` beside the whole API.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { load } from 'js-yaml';
import Ajv from 'ajv';

/** A JSON Schema (draft-07), as a fragment writes it. */
export type ApiSchema = Record<string, unknown>;
/** A route's answers, by status (`200`), class (`4xx`) or `default`. */
export type ApiResponses = Record<string, ApiSchema>;

export interface ApiFragment {
  /** The request (a kit) or the change (an application) that wrote it. */
  n: number;
  id: string;
  /** Its path. */
  file: string;
  fragment: FragmentData;
}

interface FragmentData {
  resources?: Record<string, ResourceChange>;
  all_routes?: Record<string, unknown>;
  routes?: Record<string, Record<string, unknown>>;
}

interface ResourceChange {
  schema?: ApiSchema;
  gains?: Record<string, ApiSchema>;
  states?: { field: string; add: unknown[]; test?: string }[];
  conditions?: { field: string; null_only_when?: Record<string, unknown[]> }[];
}

export interface ComposedRoute {
  method: string;
  path: string;
  /** The path as a regular expression, its parameters any segment, a query or a fragment allowed after it. */
  pattern: string;
  responses: ApiResponses;
}

/** The API up to a request: the resources as the last request left them, the routes with their answers. */
export interface ComposedApi {
  schemaVersion: 1;
  upto: number | null;
  resources: Record<string, ApiSchema>;
  routes: ComposedRoute[];
}

/** An answer read from a server. `path` is the whole path, the API's prefix included (`/v1/…`). */
export interface ApiAnswer {
  method: string;
  path: string;
  status: number;
  body: unknown;
}

/** One shape an answer breaks: the requests that set it, where in the body, and a sentence. */
export interface ApiProblem {
  requests: number[];
  at: string;
  message: string;
}

/** The keywords whose value is a schema, a list of schemas, or a map of them (draft-07). */
const ONE = ['additionalProperties', 'items', 'not', 'if', 'then', 'else', 'contains', 'propertyNames'];
const MANY = ['allOf', 'anyOf', 'oneOf', 'items'];
const MAP = ['properties', 'patternProperties', 'definitions'];

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** `request 6`, or `requests 6, 30`, with what the fragment said after a colon. */
const comment = (requests: number[], said?: string) =>
  `${requests.length > 1 ? 'requests' : 'request'} ${requests.join(', ')}${said ? `: ${said}` : ''}`;

/** The requests a comment names. */
export const requestsOf = (text: unknown): number[] =>
  (/^requests? ([\d., ]+)/.exec(typeof text === 'string' ? text : '')?.[1] ?? '')
    .split(',')
    .map(each => each.trim())
    .filter(Boolean)
    .map(Number);

/** Every schema node of `schema` (draft-07), the root first. */
function* nodes(schema: unknown): Generator<Record<string, unknown>> {
  if (!isObject(schema)) return;
  yield schema;
  for (const key of ONE) if (isObject(schema[key])) yield* nodes(schema[key]);
  for (const key of MANY) {
    const list = schema[key];
    if (Array.isArray(list)) for (const each of list) yield* nodes(each);
  }
  for (const key of MAP) {
    const map = schema[key];
    if (isObject(map)) for (const each of Object.values(map)) yield* nodes(each);
  }
}

/** A copy of `schema` whose every node names request n, unless a node already names its own. */
function stamp(schema: unknown, n: number): ApiSchema {
  const copy = clone((schema ?? {}) as ApiSchema);
  for (const node of nodes(copy))
    if (!requestsOf(node.$comment).length) node.$comment = comment([n], node.$comment as string | undefined);
  return copy;
}

/** The node of a resource's schema at a dotted path through `properties` (`payment.status`). */
function nodeAt(schema: ApiSchema, field: string): Record<string, unknown> | undefined {
  let node: unknown = schema;
  for (const name of field.split('.'))
    node = isObject(node) && isObject(node.properties) ? node.properties[name] : undefined;
  return isObject(node) ? node : undefined;
}

/** The fragments of a kit, in the backlog's order, up to request `upto` (every one when undefined). */
export function loadKitFragments(kit: string, upto?: number | string): ApiFragment[] {
  const backlog = (
    load(readFileSync(join(kit, 'backlog/backlog.yaml'), 'utf8')) as { features: { n: number; id: string }[] }
  ).features;
  return backlog
    .filter(f => upto === undefined || f.n <= Number(upto))
    .map(f => ({ n: f.n, id: f.id, file: join(kit, 'api', `${f.n}-${f.id}.yaml`) }))
    .filter(f => existsSync(f.file))
    .map(f => ({ ...f, fragment: (load(readFileSync(f.file, 'utf8')) ?? {}) as FragmentData }));
}

/**
 * The composition and what any route may answer (`all_routes`, with the default it brings), every
 * `$resource` replaced by the resource as the last request left it.
 */
function composeParts(fragments: ApiFragment[], upto?: number | string): { api: ComposedApi; anyRoute?: ApiResponses } {
  const resources: Record<string, ApiSchema> = {};
  const routes: Record<string, ApiResponses> = {};
  const allRoutes: ApiResponses = {};
  const responses = (into: ApiResponses, answers: Record<string, unknown> | undefined, n: number) => {
    for (const [status, answer] of Object.entries(answers ?? {}))
      into[status] = stamp(typeof answer === 'string' ? { $resource: answer } : answer, n);
  };
  for (const { n, id, fragment } of fragments) {
    const where = `api/${n}-${id}.yaml`;
    for (const [name, said] of Object.entries(fragment.resources ?? {})) {
      if (said.schema) resources[name] = stamp(said.schema, n);
      const resource = resources[name];
      if (!resource) throw new Error(`${where}: the resource ${name} is changed before any request defines it`);
      const gains = Object.entries(said.gains ?? {});
      if (gains.length) {
        const properties = (resource.properties = (resource.properties ?? {}) as Record<string, unknown>);
        for (const [property, schema] of gains) properties[property] = stamp(schema, n);
        // Required from this request on, under its own name: a property missing names the request that gave it.
        resource.allOf = [
          ...((resource.allOf as unknown[]) ?? []),
          { $comment: comment([n]), required: gains.map(([p]) => p) },
        ];
      }
      for (const state of said.states ?? []) {
        const node = nodeAt(resource, state.field);
        if (!Array.isArray(node?.enum))
          throw new Error(`${where}: ${name}.${state.field} gains states, and it has no enum to add them to`);
        node.enum = [...new Set([...(node.enum as unknown[]), ...state.add])];
        node.$comment = comment([...new Set([...requestsOf(node.$comment), n])]);
      }
      for (const condition of said.conditions ?? []) {
        const when = Object.entries(condition.null_only_when ?? {});
        const words = `${condition.field} is null only when ${when.map(([field, values]) => `${field} is ${values.join(' or ')}`).join(' and ')}`;
        // When the stated condition does not hold, the field is not null: a failure points at the field.
        resource.allOf = [
          ...((resource.allOf as unknown[]) ?? []),
          {
            $comment: comment([n], words),
            if: {
              not: {
                required: when.map(([field]) => field),
                properties: Object.fromEntries(when.map(([field, values]) => [field, { enum: values }])),
              },
            },
            then: { properties: { [condition.field]: { $comment: comment([n], words), not: { type: 'null' } } } },
          },
        ];
      }
    }
    responses(allRoutes, fragment.all_routes, n);
    if (fragment.all_routes)
      allRoutes.default = {
        $comment: comment([n], 'a route answers what the requests give it and nothing else; a 5xx never'),
        not: {},
      };
    for (const [route, answers] of Object.entries(fragment.routes ?? {})) {
      routes[route] = routes[route] ?? {};
      responses(routes[route], answers, n);
    }
  }

  const resolve = (schema: unknown, seen: string[] = []): unknown => {
    if (Array.isArray(schema)) return schema.map(each => resolve(each, seen));
    if (!isObject(schema)) return schema;
    if (schema.$resource !== undefined) {
      const name = String(schema.$resource);
      if (!resources[name]) throw new Error(`a response names the resource ${name}, which no request defines`);
      if (seen.includes(name)) throw new Error(`the resource ${name} contains itself`);
      return resolve(resources[name], [...seen, name]);
    }
    return Object.fromEntries(Object.entries(schema).map(([key, value]) => [key, resolve(value, seen)]));
  };
  const resolvedResources = Object.fromEntries(
    Object.entries(resources).map(([name, s]) => [name, resolve(s) as ApiSchema]),
  );
  const list: ComposedRoute[] = Object.entries(routes).map(([route, answers]) => {
    const [method, path] = route.trim().split(/\s+/);
    const pattern = `^${path.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{[^}]+\}/g, '[^/?#]+')}(?:[?#].*)?$`;
    return {
      method: method.toUpperCase(),
      path,
      pattern,
      responses: resolve({ ...allRoutes, ...answers }) as ApiResponses,
    };
  });
  // A literal route before one with a parameter at the same place: `/bookings/mine` before `/bookings/{id}`.
  const params = (route: ComposedRoute) => (route.path.match(/\{/g) ?? []).length;
  list.sort((a, b) => params(a) - params(b) || b.path.length - a.path.length);
  return {
    api: {
      schemaVersion: 1,
      upto: upto === undefined ? null : Number(upto),
      resources: resolvedResources,
      routes: list,
    },
    ...(Object.keys(allRoutes).length ? { anyRoute: resolve(allRoutes) as ApiResponses } : {}),
  };
}

/**
 * The API up to request `upto`: the resources, and the routes with their responses by status, every
 * `$resource` replaced by the resource as the last request left it. Throws on a fragment that says
 * something composition cannot do (gains on a resource never defined, a state on a field with no enum).
 */
export function composeApi(fragments: ApiFragment[], upto?: number | string): ComposedApi {
  return composeParts(fragments, upto).api;
}

/** The answers of the route a request reaches (the first whose pattern matches), or nothing. */
const routeOf = (composed: ComposedApi, method: string, path: string) =>
  composed.routes.find(r => r.method === method && new RegExp(r.pattern).test(path));

/** The schema an answer is held to: the route's own for that status, its class's, or the default. */
const pick = (responses: ApiResponses | undefined, status: number) =>
  responses && (responses[status] ?? responses[`${String(status)[0]}xx`] ?? responses.default);

/** The schema a route answered `status` is held to: its own for that status, its class's, or the default. */
export function apiSchemaFor(
  composed: ComposedApi,
  method: string,
  path: string,
  status: number,
): ApiSchema | undefined {
  return pick(routeOf(composed, method, path)?.responses, status);
}

// A format the validator does not know is not checked: the shapes are what the fragments are for.
const ajv = new Ajv({ allErrors: true, verbose: true, unknownFormats: 'ignore' });

interface AjvError {
  keyword: string;
  message?: string;
  dataPath?: string;
  instancePath?: string;
  params?: { additionalProperty?: string };
  parentSchema?: { $comment?: string };
}

/**
 * What `body` breaks of `schema`, one problem per shape, named after the answer; `named`, the property
 * an answer has and its shape does not, where the validator's sentence does not say it.
 */
function problemsAgainst(
  schema: ApiSchema | undefined,
  { method, path, status, body }: ApiAnswer,
  named = false,
): ApiProblem[] {
  if (!schema || ajv.validate(schema, body)) return [];
  const seen = new Set<string>();
  return (
    ((ajv.errors ?? []) as AjvError[])
      // An `if` that failed repeats what its `then` said: the `then`'s own errors name the field.
      .filter(error => error.keyword !== 'if')
      .map(error => {
        const said = error.parentSchema?.$comment ?? '';
        // `dataPath` in ajv 6, `instancePath` from ajv 8.
        const at = error.dataPath ?? error.instancePath ?? '';
        return {
          requests: requestsOf(said),
          at,
          message: `${method.toUpperCase()} ${path} answered ${status}: ${at || 'the body'} ${error.message}${named && error.params?.additionalProperty ? ` ('${error.params.additionalProperty}')` : ''} (${said || 'no request named'})`,
        };
      })
      .filter(problem => !seen.has(problem.message) && seen.add(problem.message))
  );
}

/**
 * What a response breaks of the composed API: one problem per shape, naming the requests that set it.
 * A route no request declares is not held to anything.
 */
export function validateAnswer(composed: ComposedApi, answer: ApiAnswer): ApiProblem[] {
  return problemsAgainst(apiSchemaFor(composed, answer.method.toUpperCase(), answer.path, answer.status), answer);
}

/**
 * For the grader: when the kit has `api/`, the composition up to `upto` written to `file`, its path
 * returned; a kit without `api/` gets nothing written, and is graded as before.
 */
export function writeComposedApi(kit: string, upto: number | string | undefined, file: string): string | undefined {
  if (!existsSync(join(kit, 'api'))) return undefined;
  writeFileSync(file, `${JSON.stringify(composeApi(loadKitFragments(kit, upto), upto), null, 2)}\n`);
  return file;
}

// --- An application's api/ ---------------------------------------------------------------------

/** Where an application keeps its API, beside its conventions. */
export const API_DIR = 'api';
const FRAGMENT_NAME = /^(\d+)-([a-z0-9][a-z0-9-]*)\.yaml$/;
const ROUTE_KEY = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) \/\S*$/;
const STATUS_KEY = /^([1-5](\d\d|xx)|default)$/;
const FRAGMENT_KEYS = ['resources', 'all_routes', 'routes'];
const RESOURCE_KEYS = ['schema', 'gains', 'states', 'conditions'];

/** An application's API, composed from its `api/`: what its end-to-end client holds every answer to. */
export interface ApplicationApi extends ComposedApi {
  /** What any route may answer (`all_routes`, and the default that refuses any other status), once declared. */
  anyRoute?: ApiResponses;
  /** The fragments it was composed from, by number: what a problem names. */
  fragments: { n: number; file: string }[];
}

/**
 * The fragments of an application's `api/` (`<root>/api/<n>-<name>.yaml`), in their order, and what
 * keeps one from being read: a file named otherwise, a number given twice, a fragment that does not
 * parse or says something a fragment does not say. A file that is not YAML (a README) is not read.
 */
export function readApplicationFragments(root: string): { fragments: ApiFragment[]; problems: string[] } {
  const directory = join(root, API_DIR);
  const problems: string[] = [];
  if (!existsSync(directory)) return { fragments: [], problems };
  const fragments: ApiFragment[] = [];
  for (const name of readdirSync(directory)
    .filter(entry => /\.ya?ml$/.test(entry))
    .sort()) {
    const file = `${API_DIR}/${name}`;
    const named = FRAGMENT_NAME.exec(name);
    if (!named) {
      problems.push(
        `${file}: a fragment is named <n>-<name>.yaml (api/2-pay-a-booking.yaml), numbered in the order the changes came`,
      );
      continue;
    }
    let fragment: unknown;
    try {
      fragment = load(readFileSync(join(directory, name), 'utf8')) ?? {};
    } catch (error) {
      problems.push(`${file} does not parse: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`);
      continue;
    }
    const wrong = fragmentProblems(fragment);
    if (wrong.length) {
      problems.push(...wrong.map(each => `${file}: ${each}`));
      continue;
    }
    fragments.push({ n: Number(named[1]), id: named[2], file, fragment: fragment as FragmentData });
  }
  fragments.sort((a, b) => a.n - b.n);
  for (let i = 1; i < fragments.length; i++)
    if (fragments[i].n === fragments[i - 1].n)
      problems.push(
        `${fragments[i].file}: ${fragments[i - 1].file} has the number ${fragments[i].n} already; one fragment per number`,
      );
  return { fragments, problems };
}

/** What a parsed fragment says that a fragment does not: an unknown key, a route or a status of another form. */
function fragmentProblems(fragment: unknown): string[] {
  if (!isObject(fragment)) return ['a fragment is a map of resources, all_routes and routes'];
  const problems: string[] = [];
  for (const key of Object.keys(fragment).filter(key => !FRAGMENT_KEYS.includes(key)))
    problems.push(`"${key}" is not something a fragment says (${FRAGMENT_KEYS.join(', ')})`);
  for (const [name, change] of Object.entries(isObject(fragment.resources) ? fragment.resources : {})) {
    if (!isObject(change)) problems.push(`the resource ${name} says none of ${RESOURCE_KEYS.join(', ')}`);
    else
      for (const key of Object.keys(change).filter(key => !RESOURCE_KEYS.includes(key)))
        problems.push(`the resource ${name} says "${key}", which is none of ${RESOURCE_KEYS.join(', ')}`);
  }
  const answers = (where: string, value: unknown) => {
    if (!isObject(value)) return problems.push(`${where} is answered by a map of statuses`);
    for (const [status, answer] of Object.entries(value)) {
      if (!STATUS_KEY.test(status))
        problems.push(`${where} answers "${status}", which is neither a status (200) nor a class (4xx)`);
      if (typeof answer !== 'string' && !isObject(answer))
        problems.push(`${where} answers ${status} with neither a resource's name nor a JSON Schema`);
    }
    return 0;
  };
  if (fragment.all_routes !== undefined) answers('all_routes', fragment.all_routes);
  for (const [route, value] of Object.entries(isObject(fragment.routes) ? fragment.routes : {})) {
    if (!ROUTE_KEY.test(route))
      problems.push(`"${route}" is not a route: a method and a whole path (GET /v1/things/{id})`);
    answers(route, value);
  }
  return problems;
}

/** Every resource a schema names (`{ $resource: name }`, anywhere inside it). */
function namedResources(schema: unknown): string[] {
  if (Array.isArray(schema)) return schema.flatMap(namedResources);
  if (!isObject(schema)) return [];
  return [
    ...(schema.$resource !== undefined ? [String(schema.$resource)] : []),
    ...Object.values(schema).flatMap(namedResources),
  ];
}

/**
 * What keeps an application's `api/` from composing, each named by its fragment: a file that does not
 * parse or is not a fragment, a resource an answer or a schema names and no fragment defines, a change
 * composition cannot make. Empty when it composes, or when the application has no `api/`.
 */
export function applicationApiProblems(root: string): string[] {
  const { fragments, problems } = readApplicationFragments(root);
  if (problems.length) return problems;
  const defined = new Set(
    fragments.flatMap(({ fragment }) =>
      Object.entries(fragment.resources ?? {})
        .filter(([, change]) => change.schema)
        .map(([name]) => name),
    ),
  );
  for (const { file, fragment } of fragments) {
    const unknown = (where: string, schema: unknown) => {
      const names = typeof schema === 'string' ? [schema] : namedResources(schema);
      for (const name of names.filter(each => !defined.has(each)))
        problems.push(`${file}: ${where} the resource ${name}, which no fragment of ${API_DIR}/ defines`);
    };
    for (const [route, answers] of Object.entries(fragment.routes ?? {}))
      for (const [status, answer] of Object.entries(answers ?? {})) unknown(`${route} answers ${status} with`, answer);
    for (const [status, answer] of Object.entries(fragment.all_routes ?? {}))
      unknown(`all_routes answers ${status} with`, answer);
    for (const [name, change] of Object.entries(fragment.resources ?? {})) {
      unknown(`the resource ${name} names`, change.schema);
      for (const gained of Object.values(change.gains ?? {})) unknown(`the resource ${name} names`, gained);
    }
  }
  if (problems.length) return problems;
  try {
    composeParts(fragments);
  } catch (error) {
    problems.push(error instanceof Error ? error.message : String(error));
  }
  return problems;
}

/** An application's API, composed from its `api/`; throws, naming each fragment, when it does not compose. */
export function loadApplicationApi(root: string): ApplicationApi {
  const problems = applicationApiProblems(root);
  if (problems.length)
    throw new Error(`${API_DIR}/ does not compose:\n${problems.map(each => `  - ${each}`).join('\n')}`);
  const { fragments } = readApplicationFragments(root);
  const { api, anyRoute } = composeParts(fragments);
  return { ...api, ...(anyRoute && { anyRoute }), fragments: fragments.map(({ n, file }) => ({ n, file })) };
}

/**
 * What an answer breaks of an application's API, each problem naming the fragments whose shape it
 * breaks. Stricter than a kit's: a route no fragment declares is held to what any route may answer
 * (`all_routes`), so a route answered before its fragment is written fails, and a status neither the
 * route nor `all_routes` names fails as such.
 */
export function applicationAnswerProblems(api: ApplicationApi, answer: ApiAnswer): string[] {
  const method = answer.method.toUpperCase();
  const route = routeOf(api, method, answer.path);
  const responses = route?.responses ?? api.anyRoute;
  const schema = pick(responses, answer.status);
  const fragmentsOf = (requests: number[]) =>
    api.fragments
      .filter(each => requests.includes(each.n))
      .map(each => each.file)
      .join(', ') || `${API_DIR}/`;
  const named = !!responses && (answer.status in responses || `${String(answer.status)[0]}xx` in responses);
  if (schema && !named) {
    const from = requestsOf(schema.$comment);
    return [
      route
        ? `${method} ${answer.path} answered ${answer.status}, a status neither its route (${route.method} ${route.path}) nor all_routes names (${fragmentsOf(from)})`
        : `${method} ${answer.path} answered ${answer.status} on a route no fragment of ${API_DIR}/ declares: write its fragment first (all_routes, ${fragmentsOf(from)}, allows no ${answer.status} elsewhere)`,
    ];
  }
  return problemsAgainst(schema, answer, true).map(
    problem => `${problem.message}, the shape ${fragmentsOf(problem.requests)} gives`,
  );
}

/** Throws when an answer breaks an application's API, with every problem, each naming its fragment. */
export function holdAnswer(api: ApplicationApi, answer: ApiAnswer): void {
  const problems = applicationAnswerProblems(api, answer);
  if (problems.length) throw new Error(problems.join('\n'));
}
