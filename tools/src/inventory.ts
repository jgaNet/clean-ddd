import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';

import { ArchitectureContract, Payload, PayloadKind, PayloadType, SUPPORTED_SCHEMA_VERSION } from './types';
import type { SourceFile } from './domain';
import { EventStorm, inspectEventStorm } from './storm';

/**
 * The inventory: what one language's tree says the application is, in words every language
 * shares — the commands of each context with who may call them, their route, the aggregate they
 * reach and the events it records; the queries; the domain events; the policies, what they react
 * to and what they publish or reach; the links between contexts. Nothing a language owns is in
 * it: no file, no class name, no idiom. Every language's conventions tool writes its own
 * (`docs/inventory/<language>.json`, canonical JSON), and the TypeScript check holds the four
 * equal (ARCH-ONE-APPLICATION): a command one language has and another lacks, a policy that
 * reaches different facts, a link one tree carries alone, is one application in three languages
 * and something else in the fourth.
 *
 * The TypeScript inventory is a projection of the event storm (storm.ts). The other languages
 * read their own canonical shapes with their own tools and must reach the same words.
 */

export const INVENTORY_DIR = 'docs/inventory';
export const INVENTORY_SCHEMA_VERSION = SUPPORTED_SCHEMA_VERSION;

export interface InventoryCommand {
  name: string;
  actor: string;
  /** `VERB /path`, every path parameter spelled `{param}`; absent when no route carries the command. */
  route?: string;
  aggregate?: string;
  events: string[];
  /**
   * `at-once` for a use case the route calls and answers by its result (the Lite profile, ADR 40);
   * absent for a command whose outcome is read later, behind a 202 (Full's grammar). Absent in every
   * inventory of a tree held to Full, so that those stay as they were.
   */
  answered?: 'at-once';
  /** The integration events a use case answered at once publishes itself, through the outbox; absent when none. */
  publishes?: string[];
}

export interface InventoryQuery {
  name: string;
  actor: string;
  route?: string;
}

export interface InventoryPolicy {
  on: string;
  kind: 'domain-event' | 'integration-event' | 'every-operation';
  publishes: string[];
  events: string[];
}

export interface InventoryContext {
  id: string;
  commands: InventoryCommand[];
  queries: InventoryQuery[];
  events: string[];
  policies: InventoryPolicy[];
}

export interface InventoryLink {
  mechanism: string;
  upstream: string;
  downstream: string;
  contracts: string[];
}

/**
 * An integration event the tree publishes, with the payload its code carries, in the published
 * language's words (ADR 44): each field by its public name in lowerCamel, to `string`, `number`,
 * `boolean`, `object`, `array` or `any`, with `?` when it may be absent.
 */
export interface InventoryIntegrationEvent {
  name: string;
  /** The context whose policy or use case publishes it. */
  publisher: string;
  payload: Payload;
}

export interface Inventory {
  schemaVersion: number;
  language: string;
  contexts: InventoryContext[];
  links: InventoryLink[];
  /** Absent in an inventory its tool wrote before ADR 44; the check says so for that language. */
  integrationEvents?: InventoryIntegrationEvent[];
}

const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name);
const sorted = (values: string[]) => [...values].sort((a, b) => a.localeCompare(b));

/** A route as every language spells it: the verb, the path, each parameter as `{param}`. */
export const canonicalRoute = (route: string): string =>
  route.replace(/:(\w+)/g, '{param}').replace(/\{\w+\}/g, '{param}');

/** Payload keys in the inventory's order for names. */
const sortedPayload = (payload: Payload): Payload =>
  Object.fromEntries(Object.entries(payload).sort(([a], [b]) => a.localeCompare(b)));

/**
 * The integration events a storm's contexts publish — a policy's `publishes`, or a use case's answered
 * at once — each with its publisher and the payload `payloads` reads for it (empty when the tree declares
 * no class for it), sorted by name, then publisher.
 */
export function publishedIntegrationEvents(
  contexts: Pick<InventoryContext, 'id' | 'commands' | 'policies'>[],
  payloads: Record<string, Payload>,
): InventoryIntegrationEvent[] {
  const found = new Map<string, InventoryIntegrationEvent>();
  for (const context of contexts) {
    const names = [
      ...context.policies.flatMap(policy => policy.publishes),
      ...context.commands.flatMap(command => command.publishes ?? []),
    ];
    for (const name of names) {
      found.set(`${name}\u0000${context.id}`, {
        name,
        publisher: context.id,
        payload: sortedPayload(payloads[name] ?? {}),
      });
    }
  }
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name) || a.publisher.localeCompare(b.publisher));
}

/** The inventory of a storm, in canonical order; `payloads` are the integration events' payloads, by public name. */
export function inventoryOf(storm: EventStorm, language: string, payloads: Record<string, Payload> = {}): Inventory {
  const contexts = [...storm.contexts]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(context => ({
      id: context.id,
      commands: context.commands
        .map(command => ({
          name: command.name,
          actor: command.actor,
          ...(command.route && { route: canonicalRoute(command.route) }),
          ...(command.aggregate && { aggregate: command.aggregate }),
          events: sorted(command.events),
          ...(command.answered && { answered: command.answered }),
          ...(command.publishes?.length && { publishes: sorted(command.publishes) }),
        }))
        .sort(byName),
      queries: context.readModels
        .map(readModel => ({
          name: readModel.name,
          actor: readModel.actor,
          ...(readModel.route && { route: canonicalRoute(readModel.route) }),
        }))
        .sort(byName),
      events: sorted(context.events.map(event => event.name)),
      policies: context.policies
        .map(policy => ({
          on: policy.on.event,
          kind: policy.on.kind,
          publishes: sorted(policy.publishes),
          events: sorted(policy.events),
        }))
        .sort((a, b) => a.kind.localeCompare(b.kind) || a.on.localeCompare(b.on)),
    }));
  return {
    schemaVersion: INVENTORY_SCHEMA_VERSION,
    language,
    // In the order of the ids, not of a binding: the bindings list their contexts as they please.
    contexts,
    links: storm.links
      .map(link => ({
        mechanism: link.mechanism,
        upstream: link.upstream,
        downstream: link.downstream,
        contracts: sorted(link.contracts),
      }))
      .sort((a, b) =>
        `${a.upstream}→${a.downstream}:${a.mechanism}`.localeCompare(`${b.upstream}→${b.downstream}:${b.mechanism}`),
      ),
    integrationEvents: publishedIntegrationEvents(contexts, payloads),
  };
}

/** The same inventory in canonical order: contexts by id, commands and queries by name, events alphabetically, policies by kind then on, links by pair. */
export function canonicalInventory(inventory: Inventory): Inventory {
  return {
    schemaVersion: inventory.schemaVersion,
    language: inventory.language,
    contexts: [...inventory.contexts]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(context => ({
        id: context.id,
        commands: [...context.commands]
          .map(command => ({
            ...command,
            events: sorted(command.events),
            ...(command.publishes && { publishes: sorted(command.publishes) }),
          }))
          .sort(byName),
        queries: [...context.queries].sort(byName),
        events: sorted(context.events),
        policies: [...context.policies]
          .map(policy => ({ ...policy, publishes: sorted(policy.publishes), events: sorted(policy.events) }))
          .sort((a, b) => a.kind.localeCompare(b.kind) || a.on.localeCompare(b.on)),
      })),
    links: [...inventory.links]
      .map(link => ({ ...link, contracts: sorted(link.contracts) }))
      .sort((a, b) =>
        `${a.upstream}→${a.downstream}:${a.mechanism}`.localeCompare(`${b.upstream}→${b.downstream}:${b.mechanism}`),
      ),
    ...(inventory.integrationEvents && {
      integrationEvents: [...inventory.integrationEvents]
        .map(event => ({ name: event.name, publisher: event.publisher, payload: sortedPayload(event.payload) }))
        .sort((a, b) => a.name.localeCompare(b.name) || a.publisher.localeCompare(b.publisher)),
    }),
  };
}

/** The inventory read from this language's tree, with the payloads of the integration events it publishes. */
export const inspectInventory = (contract: ArchitectureContract, root: string): Inventory =>
  inventoryOf(
    inspectEventStorm(contract, root),
    contract.language.id,
    integrationEventPayloads(
      readTypeScriptFiles(root, [contract.kernel.path, contract.architecture.path]),
      contract.kernel.path,
    ),
  );

/** Canonical JSON: two-space indentation, the keys in the order above, a trailing newline. The same bytes from every tool. */
export const serializeInventory = (inventory: Inventory): string => `${JSON.stringify(inventory, null, 2)}\n`;

/** Every inventory committed under docs/inventory, by language id. */
export function loadInventories(root: string): Map<string, Inventory> {
  const dir = join(root, INVENTORY_DIR);
  const found = new Map<string, Inventory>();
  if (!existsSync(dir)) return found;
  for (const entry of readdirSync(dir)
    .filter(name => name.endsWith('.json'))
    .sort()) {
    const inventory = JSON.parse(readFileSync(join(dir, entry), 'utf8')) as Inventory;
    found.set(entry.replace(/\.json$/, ''), inventory);
  }
  return found;
}

export const describeCommand = (command: InventoryCommand) =>
  `${command.name} (${command.actor}${command.route ? `, ${command.route}` : ''}${command.aggregate ? `, ${command.aggregate}` : ''} → ${command.events.join(', ') || 'nothing'}${command.publishes?.length ? `; publishes ${command.publishes.join(', ')}` : ''}${command.answered ? `; answered ${command.answered.replace('-', ' ')}` : ''})`;
export const describeQuery = (query: InventoryQuery) =>
  `${query.name} (${query.actor}${query.route ? `, ${query.route}` : ''})`;
export const describePolicy = (policy: InventoryPolicy) =>
  `on ${policy.on} (${policy.kind}${policy.publishes.length ? `, publishes ${policy.publishes.join(', ')}` : ''}${policy.events.length ? `, → ${policy.events.join(', ')}` : ''})`;
export const describeLink = (link: InventoryLink) =>
  `${link.upstream} → ${link.downstream} over an ${link.mechanism} (${link.contracts.join(', ')})`;
export const describeIntegrationEvent = (event: InventoryIntegrationEvent) =>
  `${event.name} (published by ${event.publisher}; ${describePayloadOf(event.payload)})`;
const describePayloadOf = (payload: Payload) =>
  `{ ${Object.entries(payload)
    .map(([field, type]) => `${field}: ${type}`)
    .join(', ')} }`;

/**
 * Where two inventories differ, one line each, in the words of the reference: what `other` has
 * that `reference` lacks, and the reverse. Empty means one application.
 */
export function compareInventories(reference: Inventory, other: Inventory): string[] {
  const problems: string[] = [];
  const here = reference.language;
  const there = other.language;
  const sameSet = <T>(label: string, context: string, left: T[], right: T[], describe: (item: T) => string) => {
    const leftKeys = left.map(item => JSON.stringify(item));
    const rightKeys = right.map(item => JSON.stringify(item));
    for (const [index, key] of leftKeys.entries()) {
      if (!rightKeys.includes(key))
        problems.push(`${context}: ${there} lacks the ${label} ${here} has: ${describe(left[index])}`);
    }
    for (const [index, key] of rightKeys.entries()) {
      if (!leftKeys.includes(key))
        problems.push(
          `${context}: ${there} has ${/^[aeiou]/.test(label) ? 'an' : 'a'} ${label} ${here} does not: ${describe(right[index])}`,
        );
    }
  };
  if (reference.schemaVersion !== other.schemaVersion) {
    problems.push(
      `${there}: inventory schemaVersion ${other.schemaVersion}, ${here} writes ${reference.schemaVersion}`,
    );
  }
  for (const context of reference.contexts) {
    const twin = other.contexts.find(candidate => candidate.id === context.id);
    if (!twin) {
      problems.push(`${context.id}: ${there} has no such context`);
      continue;
    }
    sameSet('command', context.id, context.commands, twin.commands, describeCommand);
    sameSet('query', context.id, context.queries, twin.queries, describeQuery);
    sameSet('domain event', context.id, context.events, twin.events, event => event);
    sameSet('policy', context.id, context.policies, twin.policies, describePolicy);
  }
  for (const context of other.contexts) {
    if (!reference.contexts.some(candidate => candidate.id === context.id)) {
      problems.push(`${context.id}: ${there} has a context ${here} does not`);
    }
  }
  sameSet('link', 'context map', reference.links, other.links, describeLink);
  // An inventory written before ADR 44 says nothing of them: the published language's check names it.
  if (reference.integrationEvents && other.integrationEvents)
    sameSet(
      'integration event',
      'published language',
      reference.integrationEvents,
      other.integrationEvents,
      describeIntegrationEvent,
    );
  else if (reference.integrationEvents?.length)
    problems.push(`published language: ${there}'s inventory records no integrationEvents, ${here}'s does`);
  return problems;
}

/**
 * What changed between the committed inventory of a language and the one its tree renders now, one
 * line per difference, in the words every language's check prints (each tool writes the same lines):
 * what the committed inventory has and the tree no longer says, what the tree says and the committed
 * one does not, and what is said by both with other fields, before → after. A stale inventory is
 * then a list of named differences, not a file to diff by hand.
 */
export function inventoryChanges(committed: Inventory, tree: Inventory): string[] {
  const lines: string[] = [];
  const quoted = (value: string | undefined) => (value === undefined ? 'none' : `"${value}"`);
  const list = (values: string[]) => `[${values.join(', ')}]`;
  type Field<T> = [name: string, read: (item: T) => string];
  const compare = <T>(
    scope: string,
    kind: string,
    before: T[],
    after: T[],
    key: (item: T) => string,
    fields: Field<T>[],
  ) => {
    const afterByKey = new Map(after.map(item => [key(item), item]));
    const beforeKeys = new Set(before.map(key));
    for (const item of before) {
      const twin = afterByKey.get(key(item));
      if (!twin) {
        lines.push(`${scope}: the committed inventory has the ${kind} ${key(item)}, the tree no longer says it`);
        continue;
      }
      const changed = fields
        .filter(([, read]) => read(item) !== read(twin))
        .map(([name, read]) => `${name} ${read(item)} → ${read(twin)}`);
      if (changed.length) lines.push(`${scope}: the ${kind} ${key(item)} differs: ${changed.join('; ')}`);
    }
    for (const item of after) {
      if (!beforeKeys.has(key(item)))
        lines.push(`${scope}: the tree says the ${kind} ${key(item)}, the committed inventory does not`);
    }
  };
  const policyKey = (sides: InventoryPolicy[][]) => (policy: InventoryPolicy) =>
    sides.some(side => side.filter(other => other.on === policy.on).length > 1)
      ? `on ${policy.on} (${policy.kind})`
      : `on ${policy.on}`;

  for (const context of committed.contexts) {
    const twin = tree.contexts.find(candidate => candidate.id === context.id);
    if (!twin) {
      lines.push(`${context.id}: the committed inventory has the context, the tree no longer says it`);
      continue;
    }
    compare(context.id, 'command', context.commands, twin.commands, command => command.name, [
      ['actor', command => quoted(command.actor)],
      ['route', command => quoted(command.route)],
      ['aggregate', command => quoted(command.aggregate)],
      ['events', command => list(command.events)],
      ['answered', command => quoted(command.answered)],
      ['publishes', command => list(command.publishes ?? [])],
    ]);
    compare(context.id, 'query', context.queries, twin.queries, query => query.name, [
      ['actor', query => quoted(query.actor)],
      ['route', query => quoted(query.route)],
    ]);
    compare(context.id, 'domain event', context.events, twin.events, event => event, []);
    const keyOf = policyKey([context.policies, twin.policies]);
    compare(context.id, 'policy', context.policies, twin.policies, keyOf, [
      ['kind', policy => quoted(policy.kind)],
      ['publishes', policy => list(policy.publishes)],
      ['events', policy => list(policy.events)],
    ]);
  }
  for (const context of tree.contexts) {
    if (!committed.contexts.some(candidate => candidate.id === context.id))
      lines.push(`${context.id}: the tree says the context, the committed inventory does not`);
  }
  compare(
    'context map',
    'link',
    committed.links,
    tree.links,
    link => `${link.upstream} → ${link.downstream} (${link.mechanism})`,
    [['contracts', link => list(link.contracts)]],
  );
  const events = (inventory: Inventory) => inventory.integrationEvents ?? [];
  const eventKey = (sides: InventoryIntegrationEvent[][]) => (event: InventoryIntegrationEvent) =>
    sides.some(side => side.filter(other => other.name === event.name).length > 1)
      ? `${event.name} (${event.publisher})`
      : event.name;
  compare(
    'published language',
    'integration event',
    events(committed),
    events(tree),
    eventKey([events(committed), events(tree)]),
    [
      ['publisher', event => quoted(event.publisher)],
      ['payload', event => describePayloadOf(event.payload)],
    ],
  );
  return lines;
}

/** `yarn architecture inventory`, in words. */
export function describeInventory(inventory: Inventory): string {
  const lines: string[] = [`Inventory of the ${inventory.language} tree (schema ${inventory.schemaVersion})`, ''];
  for (const context of inventory.contexts) {
    lines.push(
      `${context.id}: ${context.commands.length} commands, ${context.queries.length} queries, ${context.events.length} domain events, ${context.policies.length} policies`,
    );
    for (const command of context.commands) lines.push(`  ${describeCommand(command)}`);
    for (const query of context.queries) lines.push(`  reads ${describeQuery(query)}`);
    for (const policy of context.policies) lines.push(`  ${describePolicy(policy)}`);
  }
  lines.push('', 'Links:', ...inventory.links.map(link => `  ${describeLink(link)}`));
  if (inventory.integrationEvents)
    lines.push(
      '',
      'Integration events:',
      ...inventory.integrationEvents.map(event => `  ${describeIntegrationEvent(event)}`),
    );
  return lines.join('\n');
}

/**
 * The payloads of the integration events a TypeScript tree declares (ADR 44), read from the classes of
 * the shared kernel (`class NoteSharedIntegrationEvent extends IntegrationEvent<{ … }>`, or
 * `IntegrationEvent<SomePayload>` with the interface or the type beside it), by public name, in the
 * published language's six words. A named type is looked up among the declarations of `files` (the shared
 * kernel and the building blocks): a string enum or a union of string literals is a `string`, an interface
 * or a class an `object`. A field marked `?`, or whose type admits `undefined` or `null`, may be absent.
 * What is not understood is `any`: the check then names the field.
 */

/** Every `.ts` file under the given repository-relative directories, specs left out. */
export function readTypeScriptFiles(root: string, directories: string[]): SourceFile[] {
  const files: SourceFile[] = [];
  const walk = (dir: string) => {
    if (!existsSync(join(root, dir))) return;
    for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.ts') && !/\.(spec|spec-helper|d)\.ts$/.test(entry.name))
        files.push({ path, text: readFileSync(join(root, path), 'utf8') });
    }
  };
  for (const directory of directories) walk(directory);
  return files;
}

type Declaration =
  | { kind: 'enum'; body: string }
  | { kind: 'alias'; text: string }
  | { kind: 'interface'; body: string; extends: string[] }
  | { kind: 'class' };

const withoutComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

/** The text between the bracket at `open` and the one that closes it, or undefined. */
function balanced(text: string, open: number): string | undefined {
  const pairs: Record<string, string> = { '{': '}', '<': '>', '(': ')', '[': ']' };
  const closing = pairs[text[open]];
  let depth = 0;
  for (let index = open; index < text.length; index++) {
    const char = text[index];
    if (char === text[open]) depth++;
    else if (char === closing && !(char === '>' && text[index - 1] === '=')) {
      depth--;
      if (depth === 0) return text.slice(open + 1, index);
    }
  }
  return undefined;
}

/** `text` split on `separators` where no bracket is open. */
function splitTop(text: string, separators: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  let quote = '';
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quote) {
      if (char === quote && text[index - 1] !== '\\') quote = '';
    } else if (`'"\``.includes(char)) quote = char;
    else if ('{[(<'.includes(char)) depth++;
    else if ('}])'.includes(char) || (char === '>' && text[index - 1] !== '=')) depth--;
    else if (depth === 0 && separators.includes(char)) {
      parts.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts.map(part => part.trim()).filter(Boolean);
}

function declarationsOf(files: SourceFile[]): Map<string, Declaration> {
  const found = new Map<string, Declaration>();
  for (const file of files) {
    const text = withoutComments(file.text);
    for (const match of text.matchAll(/\b(enum|interface)\s+(\w+)(?:<[^{]*?>)?\s*(?:extends\s+([^{]+))?\{/g)) {
      const body = balanced(text, (match.index ?? 0) + match[0].length - 1) ?? '';
      if (match[1] === 'enum') found.set(match[2], { kind: 'enum', body });
      else
        found.set(match[2], {
          kind: 'interface',
          body,
          extends: (match[3] ?? '')
            .split(',')
            .map(name => name.trim().replace(/<.*$/, ''))
            .filter(Boolean),
        });
    }
    for (const match of text.matchAll(/\btype\s+(\w+)(?:<[^=]*?>)?\s*=/g)) {
      const start = (match.index ?? 0) + match[0].length;
      const [first] = splitTop(text.slice(start), ';');
      // Without a semicolon, the alias ends with the next declaration.
      found.set(match[1], {
        kind: 'alias',
        text: (first ?? '').split(/\n(?=\s*(?:export|import|const|class|type|interface|enum|function)\b)/)[0],
      });
    }
    for (const match of text.matchAll(/\bclass\s+(\w+)/g))
      if (!found.has(match[1])) found.set(match[1], { kind: 'class' });
  }
  return found;
}

const ABSENT = 'absent';
type Kind = PayloadKind | typeof ABSENT;

/** The six words a TypeScript type is said in, and whether it admits an absent value. */
function kindOf(type: string, declarations: Map<string, Declaration>, seen: Set<string> = new Set()): [Kind, boolean] {
  let text = type.trim().replace(/^\|/, '').trim();
  while (text.startsWith('(') && balanced(text, 0) === text.slice(1, -1)) text = text.slice(1, -1).trim();
  const union = splitTop(text, '|');
  if (union.length > 1) {
    const kinds = union.map(part => kindOf(part, declarations, seen));
    const present = [...new Set(kinds.map(([kind]) => kind).filter(kind => kind !== ABSENT))];
    const optional = kinds.some(([kind, absent]) => kind === ABSENT || absent);
    return [present.length === 1 ? present[0] : 'any', optional];
  }
  if (splitTop(text, '&').length > 1) return ['object', false];
  if (/^(string|`.*`|'.*'|".*")$/s.test(text)) return ['string', false];
  if (/^(number|bigint|-?\d[\d_.]*n?)$/.test(text)) return ['number', false];
  if (/^(boolean|true|false)$/.test(text)) return ['boolean', false];
  if (/^(undefined|null|void)$/.test(text)) return [ABSENT, true];
  if (/^(unknown|any|never)$/.test(text)) return ['any', false];
  // A date crosses the wire as its ISO 8601 string.
  if (text === 'Date') return ['string', false];
  if (text.endsWith('[]') || text.startsWith('[') || /^(Readonly)?Array<|^(ReadonlySet|Set)</.test(text))
    return ['array', false];
  if (text.startsWith('{') || /^(Record|Partial|Required|Pick|Omit|Map|ReadonlyMap)</.test(text))
    return ['object', false];
  const readonly = text.match(/^(?:Readonly|NonNullable)<(.*)>$/s);
  if (readonly) return [kindOf(readonly[1], declarations, seen)[0], false];
  const name = text.match(/^(\w+)(?:\.\w+)?(?:<.*>)?$/s)?.[1];
  const declaration = name ? declarations.get(name) : undefined;
  if (!name || !declaration || seen.has(name)) return ['any', false];
  switch (declaration.kind) {
    case 'enum': {
      const members = splitTop(declaration.body, ',');
      return [members.length && members.every(member => /=\s*(['"`])/.test(member)) ? 'string' : 'number', false];
    }
    case 'alias':
      return kindOf(declaration.text, declarations, new Set([...seen, name]));
    default:
      return ['object', false];
  }
}

/** The fields of an object type's body, an interface's with those it extends. */
function fieldsOf(body: string, declarations: Map<string, Declaration>, inherited: string[] = []): Payload {
  const payload: Payload = {};
  for (const base of inherited) {
    const declaration = declarations.get(base);
    if (declaration?.kind === 'interface')
      Object.assign(payload, fieldsOf(declaration.body, declarations, declaration.extends));
  }
  // Members end at `;`, `,` or a new line; a line that does not start a member continues the one before.
  const members: string[] = [];
  for (const part of splitTop(body, ';,\n')) {
    if (/^(readonly\s+)?(['"]?[\w$]+['"]?)\s*\??\s*:/.test(part) || !members.length) members.push(part);
    else members[members.length - 1] += ` ${part}`;
  }
  for (const member of members) {
    const match = member.match(/^(?:readonly\s+)?['"]?([\w$]+)['"]?\s*(\?)?\s*:([\s\S]*)$/);
    if (!match) continue;
    const [kind, absent] = kindOf(match[3], declarations);
    const type: PayloadKind = kind === ABSENT ? 'any' : kind;
    payload[publicField(match[1])] = (match[2] || absent ? `${type}?` : type) as PayloadType;
  }
  return payload;
}

/** A field's public name: lowerCamel, whatever the code spells it (`note_id` is `noteId`). */
const publicField = (name: string) =>
  name.replace(/^[A-Z]/, char => char.toLowerCase()).replace(/_([a-z0-9])/g, (_, char: string) => char.toUpperCase());

/**
 * The payload of every `<Name>IntegrationEvent` class declared under `kernel` (repository-relative), by
 * public name; `files` are where its types are declared (the shared kernel and the building blocks).
 */
export function integrationEventPayloads(files: SourceFile[], kernel: string): Record<string, Payload> {
  const declarations = declarationsOf(files);
  const payloads: Record<string, Payload> = {};
  for (const file of files.filter(each => each.path.startsWith(`${kernel}/`))) {
    const text = withoutComments(file.text);
    for (const match of text.matchAll(/class\s+(\w+)IntegrationEvent\s+extends\s+IntegrationEvent\s*</g)) {
      const argument = (balanced(text, (match.index ?? 0) + match[0].length - 1) ?? '').trim();
      if (argument.startsWith('{')) {
        payloads[match[1]] = fieldsOf(balanced(argument, 0) ?? '', declarations);
        continue;
      }
      const name = argument.match(/^(\w+)/)?.[1];
      const declaration = name ? declarations.get(name) : undefined;
      if (declaration?.kind === 'interface')
        payloads[match[1]] = fieldsOf(declaration.body, declarations, declaration.extends);
      else if (declaration?.kind === 'alias' && declaration.text.trim().startsWith('{'))
        payloads[match[1]] = fieldsOf(balanced(declaration.text.trim(), 0) ?? '', declarations);
      else payloads[match[1]] = {};
    }
  }
  return payloads;
}
