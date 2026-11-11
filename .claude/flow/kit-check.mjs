#!/usr/bin/env node
/**
 * A kit held to the standard before its campaign is registered (docs/evaluations/benchmark/kit-standard.md):
 * a convention a late request relies on is tested where it is born, not found by the first tree that
 * fails it fifty requests later (OpenStay J5, request 80; J5b, requests 61 and 73).
 *
 *   node .claude/flow/kit-check.mjs <kit>
 *
 * It refuses:
 * - a request whose backlog file has an API table and no fragment (`api/<n>-<id>.yaml`), or a route of
 *   that table no fragment up to that request declares; a fragment that does not compose;
 * - a convention of the register (`conventions.yaml`) without `born`, or without its test: the named
 *   `it` must be in the acceptance file of the request that sets it;
 * - a state a fragment adds without a test, in that request's acceptance file, that reads the whole
 *   resource in that state;
 * - an operation, as the kit's requests compose it, that differs from the contract's
 *   (`http.operation` in conventions/architecture.yaml): a conflict to decide in the kit's first
 *   request. A convention born there that says it `departs` from a field is that decision, and the
 *   difference is then printed as decided, not refused.
 *
 * It prints every finding and exits 1 on any. It runs no agent and no tree.
 */
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compose, loadFragments, requestsOf } from './api-schema.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const yaml = createRequire(import.meta.url)('js-yaml');
const ROUTE = /`\s*(GET|POST|PUT|PATCH|DELETE)\s+([^`\s]+)/;

/** The `it` (or `test`) names a test file declares, as the runner reads them. */
export function testNames(text) {
  return [...text.matchAll(/\b(?:it|test)(?:\.only|\.skip)?\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g)].map(match =>
    match[2].replace(/\\(.)/g, '$1'),
  );
}

/** The routes of a backlog file's API tables (a table whose first header cell is `Request`), or undefined if it has none. */
export function apiTableRoutes(markdown) {
  const lines = markdown.split('\n');
  let inTable = false;
  let found = false;
  const routes = [];
  for (const line of lines) {
    if (/^\|\s*Request\s*\|/i.test(line)) {
      inTable = found = true;
      continue;
    }
    if (!line.startsWith('|')) inTable = false;
    if (!inTable || /^\|[\s:-]+\|/.test(line)) continue;
    const route = ROUTE.exec(line.split('|')[1] ?? '');
    if (route) routes.push(`${route[1]} ${route[2].split('?')[0]}`);
  }
  return found ? routes : undefined;
}

/** A path's shape, its parameters' names left out: `/v1/bookings/{}`. */
const shape = route => route.replace(/\{[^}]*\}|:[^/]+/g, '{}');

const typesOf = schema => {
  if (schema?.type) return [schema.type].flat();
  const values = schema?.enum ?? (schema && 'const' in schema ? [schema.const] : undefined);
  if (!values) return undefined;
  return [...new Set(values.map(value => (value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value)))];
};
/** A schema in a few words: `string`, `object`, `string (PENDING, SUCCESS)`. */
const described = schema =>
  [typesOf(schema)?.join(' or ') ?? 'anything', schema?.enum ? `(${schema.enum.join(', ')})` : '']
    .filter(Boolean)
    .join(' ');

/**
 * Where the kit's operation differs from the contract's record: a field the contract does not have,
 * a field of another type, a status the contract does not know. Nested objects are compared field by field.
 */
export function operationConflicts(kit, contract, at = '') {
  const conflicts = [];
  for (const [field, schema] of Object.entries(kit?.properties ?? {})) {
    const path = `${at}${field}`;
    const theirs = contract?.properties?.[field];
    const requests = requestsOf(schema.$comment);
    if (!theirs) {
      if (contract?.additionalProperties === false)
        conflicts.push({
          field: path,
          requests,
          message: `the kit's operation has \`${path}\`; the contract's has not`,
        });
      continue;
    }
    const ours = typesOf(schema);
    const theirsTypes = typesOf(theirs);
    if (ours && theirsTypes && ours.some(type => !theirsTypes.includes(type))) {
      conflicts.push({
        field: path,
        requests,
        message: `the kit's operation \`${path}\` is ${described(schema)}; the contract's is ${described(theirs)}`,
      });
      continue;
    }
    const unknown = (schema.enum ?? []).filter(value => theirs.enum && !theirs.enum.includes(value));
    if (unknown.length)
      conflicts.push({
        field: path,
        requests,
        message: `the kit's operation \`${path}\` takes ${unknown.join(', ')}, which the contract's does not (${theirs.enum.join(', ')})`,
      });
    if (schema.properties && theirs.properties) conflicts.push(...operationConflicts(schema, theirs, `${path}.`));
  }
  return conflicts;
}

/** The findings of a kit, and the notes (differences from the contract the kit decided in its first request). */
export function checkKit(kit, { contract = join(here, '../../conventions/architecture.yaml') } = {}) {
  const findings = [];
  const notes = [];
  const find = (check, request, message) => findings.push({ check, request, message });
  const features = yaml.load(readFileSync(join(kit, 'backlog/backlog.yaml'), 'utf8')).features;
  const first = features[0]?.n;
  const known = new Map(features.map(f => [String(f.n), f]));
  const names = new Map();
  const testsOf = f => {
    if (!names.has(f.n)) {
      const file = join(kit, 'acceptance', `${f.n}-${f.id}.acceptance.ts`);
      names.set(f.n, existsSync(file) ? testNames(readFileSync(file, 'utf8')) : undefined);
    }
    return names.get(f.n);
  };
  /** Whether request f's acceptance file has the `it` named, with the finding when it has not. */
  const tested = (check, f, it, what) => {
    if (!it) return (find(check, f.n, `${what} names no test`), false);
    const tests = testsOf(f);
    if (!tests) return (find(check, f.n, `${what}: request ${f.n} has no acceptance file`), false);
    if (!tests.includes(it))
      return (find(check, f.n, `${what}: no it('${it}') in ${f.n}-${f.id}.acceptance.ts`), false);
    return true;
  };

  // 1. Every request whose backlog file has an API table has a fragment, and every route of its table composes.
  const fragments = loadFragments(kit);
  const fragmentOf = new Map(fragments.map(each => [each.n, each]));
  for (const f of features) {
    const file = join(kit, 'backlog', `${f.n}-${f.id}.md`);
    const routes = existsSync(file) ? apiTableRoutes(readFileSync(file, 'utf8')) : undefined;
    if (routes && !fragmentOf.has(f.n)) {
      find('fragment', f.n, `${f.n}-${f.id}.md has an API table, and there is no api/${f.n}-${f.id}.yaml`);
      continue;
    }
    if (!routes) continue;
    let upToN;
    try {
      upToN = compose(
        fragments.filter(each => each.n <= f.n),
        f.n,
      );
    } catch (error) {
      find('fragment', f.n, `the fragments up to request ${f.n} do not compose: ${error.message}`);
      continue;
    }
    const declared = new Set(upToN.routes.map(route => `${route.method} ${shape(route.path)}`));
    for (const route of routes)
      if (!declared.has(shape(route)))
        find(
          'fragment',
          f.n,
          `${f.n}-${f.id}.md's table names ${route}, which no fragment up to request ${f.n} declares`,
        );
  }
  let composed;
  try {
    composed = compose(fragments);
  } catch (error) {
    find('fragment', undefined, `the fragments do not compose: ${error.message}`);
  }

  // 3. A state added is read whole, by a test of the request that adds it.
  for (const { n, id, fragment } of fragments)
    for (const [resource, change] of Object.entries(fragment.resources ?? {}))
      for (const state of change.states ?? [])
        tested(
          'state',
          { n, id },
          state.test,
          `api/${n}-${id}.yaml adds ${(state.add ?? []).join(', ')} to ${resource}.${state.field}, and its whole-resource test`,
        );

  // 2. Every convention says what it is, the request that sets it, and the test that holds it there.
  const registerFile = join(kit, 'conventions.yaml');
  const register = existsSync(registerFile)
    ? (yaml.load(readFileSync(registerFile, 'utf8'))?.conventions ?? [])
    : undefined;
  if (!register)
    find(
      'convention',
      undefined,
      'the kit has no conventions.yaml: the conventions its requests rely on are not registered',
    );
  const departures = new Map();
  for (const [index, convention] of (register ?? []).entries()) {
    const name = convention.id ?? `convention ${index + 1}`;
    if (!convention.says) find('convention', convention.born, `${name} does not say what the convention is`);
    if (convention.born === undefined) {
      find('convention', undefined, `${name} has no \`born\`: the request that sets it`);
      continue;
    }
    const f = known.get(String(convention.born));
    if (!f) {
      find(
        'convention',
        convention.born,
        `${name} is born at request ${convention.born}, which the backlog does not have`,
      );
      continue;
    }
    tested('convention', f, convention.test, name);
    for (const field of [convention.departs ?? []].flat())
      departures.set(String(field).replace(/^operation\./, ''), { name, born: convention.born });
  }

  // 4. The operation the kit's requests compose, against the contract's.
  const record = yaml.load(readFileSync(contract, 'utf8'))?.http?.operation?.record;
  const operation = composed?.resources?.operation;
  if (record && operation)
    for (const conflict of operationConflicts(operation, record)) {
      const departure = [...departures.entries()].find(
        ([field]) => conflict.field === field || conflict.field.startsWith(`${field}.`),
      )?.[1];
      const where = conflict.requests.length ? ` (request ${conflict.requests.join(', ')})` : '';
      if (departure && departure.born === first)
        notes.push(`decided in request ${first} by ${departure.name}: ${conflict.message}${where}`);
      else
        find(
          'contract',
          first,
          `${conflict.message}${where}: a conflict to decide in request ${first}${departure ? ` (${departure.name} decides it at request ${departure.born})` : ''}`,
        );
    }
  return { findings, notes };
}

function main() {
  const kit = process.argv[2];
  if (!kit) {
    process.stderr.write('usage: node .claude/flow/kit-check.mjs <kit>\n');
    process.exit(2);
  }
  const { findings, notes } = checkKit(resolve(kit));
  for (const note of notes) process.stdout.write(`  note: ${note}\n`);
  for (const f of findings)
    process.stdout.write(`  ${f.check}${f.request === undefined ? '' : ` (request ${f.request})`}: ${f.message}\n`);
  process.stdout.write(`kit-check ${kit}: ${findings.length ? `${findings.length} finding(s)` : 'clean'}\n`);
  process.exit(findings.length ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
