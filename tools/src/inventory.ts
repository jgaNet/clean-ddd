import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';

import { ArchitectureContract, SUPPORTED_SCHEMA_VERSION } from './types';
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

export interface Inventory {
  schemaVersion: number;
  language: string;
  contexts: InventoryContext[];
  links: InventoryLink[];
}

const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name);
const sorted = (values: string[]) => [...values].sort((a, b) => a.localeCompare(b));

/** A route as every language spells it: the verb, the path, each parameter as `{param}`. */
export const canonicalRoute = (route: string): string =>
  route.replace(/:(\w+)/g, '{param}').replace(/\{\w+\}/g, '{param}');

/** The inventory of a storm, in canonical order. */
export function inventoryOf(storm: EventStorm, language: string): Inventory {
  return {
    schemaVersion: INVENTORY_SCHEMA_VERSION,
    language,
    // In the order of the ids, not of a binding: the bindings list their contexts as they please.
    contexts: [...storm.contexts]
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
      })),
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
        commands: [...context.commands].map(command => ({ ...command, events: sorted(command.events) })).sort(byName),
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
  };
}

/** The inventory read from this language's tree. */
export const inspectInventory = (contract: ArchitectureContract, root: string): Inventory =>
  inventoryOf(inspectEventStorm(contract, root), contract.language.id);

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
  `${command.name} (${command.actor}${command.route ? `, ${command.route}` : ''}${command.aggregate ? `, ${command.aggregate}` : ''} → ${command.events.join(', ') || 'nothing'})`;
export const describeQuery = (query: InventoryQuery) =>
  `${query.name} (${query.actor}${query.route ? `, ${query.route}` : ''})`;
export const describePolicy = (policy: InventoryPolicy) =>
  `on ${policy.on} (${policy.kind}${policy.publishes.length ? `, publishes ${policy.publishes.join(', ')}` : ''}${policy.events.length ? `, → ${policy.events.join(', ')}` : ''})`;
export const describeLink = (link: InventoryLink) =>
  `${link.upstream} → ${link.downstream} over an ${link.mechanism} (${link.contracts.join(', ')})`;

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
        problems.push(`${context}: ${there} has a ${label} ${here} does not: ${describe(right[index])}`);
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
  return lines.join('\n');
}
