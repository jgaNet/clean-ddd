/**
 * The API a kit's requests give, as data: each request's fragment (`api/<n>-<id>.yaml` in the kit),
 * composed up to request n, and a response held to the composition. Every shape carries the request
 * that set it, so a problem names the request a tree departed from, not only the line of a test
 * (docs/evaluations/benchmark/kit-standard.md).
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
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const yaml = require('js-yaml');
const Ajv = require('ajv');

/** The keywords whose value is a schema, a list of schemas, or a map of them (draft-07). */
const ONE = ['additionalProperties', 'items', 'not', 'if', 'then', 'else', 'contains', 'propertyNames'];
const MANY = ['allOf', 'anyOf', 'oneOf', 'items'];
const MAP = ['properties', 'patternProperties', 'definitions'];

const clone = value => JSON.parse(JSON.stringify(value));
const isObject = value => typeof value === 'object' && value !== null && !Array.isArray(value);

/** `request 6`, or `requests 6, 30`, with what the fragment said after a colon. */
const comment = (requests, said) =>
  `${requests.length > 1 ? 'requests' : 'request'} ${requests.join(', ')}${said ? `: ${said}` : ''}`;
/** The requests a comment names. */
export const requestsOf = text =>
  (/^requests? ([\d., ]+)/.exec(text ?? '')?.[1] ?? '')
    .split(',')
    .map(each => each.trim())
    .filter(Boolean)
    .map(Number);

/** Every schema node of `schema` (draft-07), the root first. */
function* nodes(schema) {
  if (!isObject(schema)) return;
  yield schema;
  for (const key of ONE) if (isObject(schema[key])) yield* nodes(schema[key]);
  for (const key of MANY) if (Array.isArray(schema[key])) for (const each of schema[key]) yield* nodes(each);
  for (const key of MAP) if (isObject(schema[key])) for (const each of Object.values(schema[key])) yield* nodes(each);
}

/** A copy of `schema` whose every node names request n, unless a node already names its own. */
function stamp(schema, n) {
  const copy = clone(schema ?? {});
  for (const node of nodes(copy)) if (!requestsOf(node.$comment).length) node.$comment = comment([n], node.$comment);
  return copy;
}

/** The node of a resource's schema at a dotted path through `properties` (`payment.status`). */
function nodeAt(schema, field) {
  let node = schema;
  for (const name of field.split('.')) node = node?.properties?.[name];
  return node;
}

/** The fragments of a kit, in the backlog's order, up to request `upto` (every one when undefined). */
export function loadFragments(kit, upto) {
  const backlog = yaml.load(readFileSync(join(kit, 'backlog/backlog.yaml'), 'utf8')).features;
  return backlog
    .filter(f => upto === undefined || f.n <= Number(upto))
    .map(f => ({ n: f.n, id: f.id, file: join(kit, 'api', `${f.n}-${f.id}.yaml`) }))
    .filter(f => existsSync(f.file))
    .map(f => ({ ...f, fragment: yaml.load(readFileSync(f.file, 'utf8')) ?? {} }));
}

/**
 * The API up to request `upto`: the resources, and the routes with their responses by status, every
 * `$resource` replaced by the resource as the last request left it. Throws on a fragment that says
 * something composition cannot do (gains on a resource never defined, a state on a field with no enum).
 */
export function compose(fragments, upto) {
  const resources = {};
  const routes = {};
  const allRoutes = {};
  const responses = (into, answers, n) => {
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
        resource.properties = resource.properties ?? {};
        for (const [property, schema] of gains) resource.properties[property] = stamp(schema, n);
        // Required from this request on, under its own name: a property missing names the request that gave it.
        resource.allOf = [...(resource.allOf ?? []), { $comment: comment([n]), required: gains.map(([p]) => p) }];
      }
      for (const state of said.states ?? []) {
        const node = nodeAt(resource, state.field);
        if (!Array.isArray(node?.enum))
          throw new Error(`${where}: ${name}.${state.field} gains states, and it has no enum to add them to`);
        node.enum = [...new Set([...node.enum, ...state.add])];
        node.$comment = comment([...new Set([...requestsOf(node.$comment), n])]);
      }
      for (const condition of said.conditions ?? []) {
        const when = Object.entries(condition.null_only_when ?? {});
        const words = `${condition.field} is null only when ${when.map(([field, values]) => `${field} is ${values.join(' or ')}`).join(' and ')}`;
        // When the stated condition does not hold, the field is not null: a failure points at the field.
        resource.allOf = [
          ...(resource.allOf ?? []),
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

  const resolve = (schema, seen = []) => {
    if (Array.isArray(schema)) return schema.map(each => resolve(each, seen));
    if (!isObject(schema)) return schema;
    if (schema.$resource !== undefined) {
      const name = schema.$resource;
      if (!resources[name]) throw new Error(`a response names the resource ${name}, which no request defines`);
      if (seen.includes(name)) throw new Error(`the resource ${name} contains itself`);
      return resolve(resources[name], [...seen, name]);
    }
    return Object.fromEntries(Object.entries(schema).map(([key, value]) => [key, resolve(value, seen)]));
  };
  const resolvedResources = Object.fromEntries(Object.entries(resources).map(([name, s]) => [name, resolve(s)]));
  const list = Object.entries(routes).map(([route, answers]) => {
    const [method, path] = route.trim().split(/\s+/);
    const pattern = `^${path.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{[^}]+\}/g, '[^/?#]+')}(?:[?#].*)?$`;
    return { method: method.toUpperCase(), path, pattern, responses: resolve({ ...allRoutes, ...answers }) };
  });
  // A literal route before one with a parameter at the same place: `/bookings/mine` before `/bookings/{id}`.
  const params = route => (route.path.match(/\{/g) ?? []).length;
  list.sort((a, b) => params(a) - params(b) || b.path.length - a.path.length);
  return {
    schemaVersion: 1,
    upto: upto === undefined ? null : Number(upto),
    resources: resolvedResources,
    routes: list,
  };
}

/** The schema a route answered `status` is held to: its own for that status, its class's, or the default. */
export function schemaFor(composed, method, path, status) {
  const responses = composed.routes.find(r => r.method === method && new RegExp(r.pattern).test(path))?.responses;
  return responses && (responses[status] ?? responses[`${String(status)[0]}xx`] ?? responses.default);
}

// A format the validator does not know is not checked: the shapes are what the fragments are for.
const ajv = new Ajv({ allErrors: true, verbose: true, unknownFormats: 'ignore' });

/**
 * What a response breaks of the composed API: one problem per shape, naming the requests that set it.
 * A route no request declares is not held to anything.
 */
export function validate(composed, { method, path, status, body }) {
  const schema = schemaFor(composed, method.toUpperCase(), path, status);
  if (!schema || ajv.validate(schema, body)) return [];
  const seen = new Set();
  return (
    ajv.errors
      // An `if` that failed repeats what its `then` said: the `then`'s own errors name the field.
      .filter(error => error.keyword !== 'if')
      .map(error => {
        const said = error.parentSchema?.$comment ?? '';
        // `dataPath` in ajv 6, `instancePath` from ajv 8.
        const at = error.dataPath ?? error.instancePath ?? '';
        return {
          requests: requestsOf(said),
          at,
          message: `${method.toUpperCase()} ${path} answered ${status}: ${at || 'the body'} ${error.message} (${said || 'no request named'})`,
        };
      })
      .filter(problem => !seen.has(problem.message) && seen.add(problem.message))
  );
}

/**
 * For the grader: when the kit has `api/`, the composition up to `upto` written to `file`, its path
 * returned; a kit without `api/` gets nothing written, and is graded as before.
 */
export function writeComposed(kit, upto, file) {
  if (!existsSync(join(kit, 'api'))) return undefined;
  writeFileSync(file, `${JSON.stringify(compose(loadFragments(kit, upto), upto), null, 2)}\n`);
  return file;
}
