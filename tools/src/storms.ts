import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { load } from 'js-yaml';

import { ArchitectureContract, ContractError, SUPPORTED_SCHEMA_VERSION } from './types';
import { loadDomainMap } from './domain';
import { EventStorm, StormCommand, StormEvent, StormPolicy, StormReadModel } from './storm';
import {
  Inventory,
  InventoryCommand,
  InventoryLink,
  InventoryPolicy,
  InventoryQuery,
  canonicalInventory,
  canonicalRoute,
  compareInventories,
  describeCommand,
  describePolicy,
  describeQuery,
} from './inventory';

/**
 * An expected storm: what an event-storming session decided a feature adds, written as data
 * before the code exists, in the words of the inventory — so that one file is true for every
 * language — and held to the code afterwards. A storm is a *delta*: the commands, queries,
 * events, policies and links the feature brings, with the hot spots the session left open and
 * how each was decided. It generates no code and is not a source of truth: the code is. It is
 * what the code is compared to.
 *
 * `storm validate <file>` holds it to the contract and the map (a declared context, a verb of
 * the HTTP grammar, an actor of the three, an event that exists or is brought, a pivot the map
 * relates); `storm --expect <file>` compares the expected inventory (the current one plus the
 * delta) to the one read from the code and names each difference — before the work, that list
 * is what to build; after it, an empty list is the proof. What the code adds beyond the storm is not
 * its question: that shows in the diff of the committed inventories, which the review reads against it. The check holds every storm under
 * conventions/storms: a storm `done` is carried by the code, one not done is not yet.
 */

export const STORMS_DIR = 'conventions/storms';
export const ACTORS = ['an administrator', 'a signed-in account', 'anyone'] as const;
export const POLICY_KINDS = ['domain-event', 'integration-event', 'every-operation'] as const;

export interface HotSpot {
  question: string;
  /** How the session or the owner decided it; required once the storm is done. */
  decision?: string;
}

export interface StormContextDelta {
  id: string;
  commands: InventoryCommand[];
  queries: InventoryQuery[];
  events: string[];
  policies: InventoryPolicy[];
}

export interface ExpectedStorm {
  schemaVersion: number;
  feature: string;
  intent: string;
  /** True once the code carries it; the check holds it either way. */
  done: boolean;
  hotSpots: HotSpot[];
  contexts: StormContextDelta[];
  links: InventoryLink[];
  source: string;
}

type Raw = Record<string, unknown>;
const isObject = (value: unknown): value is Raw => typeof value === 'object' && value !== null && !Array.isArray(value);
const strings = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : []);
const text = (value: unknown): string => (typeof value === 'string' ? value : '');

export function loadExpectedStorm(file: string, root: string): ExpectedStorm {
  const path = join(root, file);
  if (!existsSync(path)) throw new ContractError(`${file} not found`, 'malformed');
  const raw = load(readFileSync(path, 'utf8'));
  if (!isObject(raw)) throw new ContractError(`${file} is not a YAML mapping`, 'malformed');
  if (raw.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
    throw new ContractError(
      `${file} is schemaVersion ${raw.schemaVersion}; this tooling understands ${SUPPORTED_SCHEMA_VERSION}`,
      raw.schemaVersion === undefined ? 'malformed' : 'unsupported-schema-version',
    );
  }
  for (const field of ['feature', 'intent']) {
    if (typeof raw[field] !== 'string') throw new ContractError(`${file}: "${field}" is missing`, 'malformed');
  }
  if (!Array.isArray(raw.contexts) || !raw.contexts.length) {
    throw new ContractError(`${file}: "contexts" must list at least one context the feature touches`, 'malformed');
  }
  const command = (entry: Raw): InventoryCommand => ({
    name: text(entry.name),
    actor: text(entry.actor),
    ...(text(entry.route) ? { route: canonicalRoute(text(entry.route)) } : {}),
    ...(text(entry.aggregate) ? { aggregate: text(entry.aggregate) } : {}),
    events: strings(entry.events),
  });
  return {
    schemaVersion: raw.schemaVersion,
    feature: text(raw.feature),
    intent: text(raw.intent),
    done: raw.done === true,
    hotSpots: (Array.isArray(raw.hotSpots) ? raw.hotSpots : []).filter(isObject).map(entry => ({
      question: text(entry.question),
      ...(text(entry.decision) ? { decision: text(entry.decision) } : {}),
    })),
    contexts: raw.contexts.filter(isObject).map(entry => ({
      id: text(entry.id),
      commands: (Array.isArray(entry.commands) ? entry.commands : []).filter(isObject).map(command),
      queries: (Array.isArray(entry.queries) ? entry.queries : []).filter(isObject).map(query => ({
        name: text(query.name),
        actor: text(query.actor),
        ...(text(query.route) ? { route: canonicalRoute(text(query.route)) } : {}),
      })),
      events: strings(entry.events),
      policies: (Array.isArray(entry.policies) ? entry.policies : []).filter(isObject).map(policy => ({
        on: text(policy.on),
        kind: text(policy.kind) as InventoryPolicy['kind'],
        publishes: strings(policy.publishes),
        events: strings(policy.events),
      })),
    })),
    links: (Array.isArray(raw.links) ? raw.links : []).filter(isObject).map(link => ({
      mechanism: text(link.mechanism),
      upstream: text(link.upstream),
      downstream: text(link.downstream),
      contracts: strings(link.contracts),
    })),
    source: file,
  };
}

const pascal = /^[A-Z][A-Za-z0-9]*$/;

/**
 * Everything a storm can get wrong against the contract, the map and the current inventory:
 * the shape of each sticky, and whether what it leans on exists or is brought by the storm.
 */
export function validateExpectedStorm(
  storm: ExpectedStorm,
  contract: ArchitectureContract,
  current: Inventory,
  root: string,
): string[] {
  const problems: string[] = [];
  const where = storm.source;
  const map = loadDomainMap(root);
  const verbs = new Set(contract.verbs.map(verb => verb.verb));
  const contexts = new Set(contract.contexts);
  const published = new Set([
    ...current.contexts.flatMap(context => context.policies.flatMap(policy => policy.publishes)),
    ...storm.contexts.flatMap(context => context.policies.flatMap(policy => policy.publishes)),
  ]);
  const publisherOf = (event: string) =>
    [...current.contexts, ...storm.contexts].find(context =>
      context.policies.some(policy => policy.publishes.includes(event)),
    )?.id;

  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(storm.feature))
    problems.push(`${where}: "feature" should be kebab-case (pin-a-note)`);
  for (const hotSpot of storm.hotSpots) {
    if (!hotSpot.question) problems.push(`${where}: a hot spot has no question`);
    if (storm.done && !hotSpot.decision)
      problems.push(`${where}: the storm is done but the hot spot "${hotSpot.question}" is not decided`);
  }
  const touched = new Set<string>();
  for (const context of storm.contexts) {
    const at = `${where} ${context.id || '(no context)'}`;
    if (!contexts.has(context.id)) {
      problems.push(
        `${at}: is not a declared context (${contract.contexts.join(', ')}); a new context is a decision, declared in the bindings and the domain map first`,
      );
      continue;
    }
    if (touched.has(context.id)) problems.push(`${at}: listed twice`);
    touched.add(context.id);
    const existing = current.contexts.find(candidate => candidate.id === context.id);
    const knownEvents = new Set([...(existing?.events ?? []), ...context.events]);
    for (const event of context.events) {
      if (!pascal.test(event) || /Event$/.test(event))
        problems.push(`${at}: the event "${event}" is a public name, PascalCase without the Event suffix (NotePinned)`);
    }
    for (const command of context.commands) {
      const here = `${at} command "${command.name || '(no name)'}"`;
      if (!pascal.test(command.name) || /CommandEvent$/.test(command.name))
        problems.push(`${here}: a public name, PascalCase without the CommandEvent suffix (PinNote)`);
      if (!ACTORS.includes(command.actor as (typeof ACTORS)[number]))
        problems.push(`${here}: actor must be one of ${ACTORS.join(', ')}`);
      if (command.route) {
        const [verb, path, ...rest] = command.route.split(' ');
        if (!verbs.has(verb) || !path?.startsWith('/') || rest.length)
          problems.push(
            `${here}: route must be "VERB /path" with a verb of the HTTP grammar (${[...verbs].join(', ')})`,
          );
        if (verb === 'GET')
          problems.push(
            `${here}: a command on GET is the one exception of the grammar (a link in an email), not a shape to copy`,
          );
      } else {
        problems.push(`${here}: names no route; a command a client cannot send is not a feature yet`);
      }
      if (!command.aggregate) problems.push(`${here}: names no aggregate; a command asks a behaviour of one`);
      else if (!pascal.test(command.aggregate))
        problems.push(`${here}: the aggregate "${command.aggregate}" is PascalCase`);
      if (!command.events.length) problems.push(`${here}: records no event; a command that changes nothing is a query`);
      for (const event of command.events) {
        if (!knownEvents.has(event))
          problems.push(`${here}: records "${event}", which neither the code nor this storm brings to ${context.id}`);
      }
    }
    for (const query of context.queries) {
      const here = `${at} query "${query.name || '(no name)'}"`;
      if (!pascal.test(query.name) || /QueryHandler$/.test(query.name))
        problems.push(`${here}: a public name, PascalCase without the QueryHandler suffix (GetPinnedNotes)`);
      if (!ACTORS.includes(query.actor as (typeof ACTORS)[number]))
        problems.push(`${here}: actor must be one of ${ACTORS.join(', ')}`);
      if (query.route && !query.route.startsWith('GET /')) problems.push(`${here}: a query is read on GET`);
      if (!query.route) problems.push(`${here}: names no route`);
    }
    for (const policy of context.policies) {
      const here = `${at} policy on "${policy.on || '(nothing)'}"`;
      if (!POLICY_KINDS.includes(policy.kind)) problems.push(`${here}: kind must be one of ${POLICY_KINDS.join(', ')}`);
      if (policy.kind === 'domain-event' && !knownEvents.has(policy.on)) {
        problems.push(`${here}: reacts to a domain event neither the code nor this storm brings to ${context.id}`);
      }
      if (policy.kind === 'integration-event') {
        if (!published.has(policy.on))
          problems.push(`${here}: reacts to an integration event nobody publishes; the publisher's policy comes first`);
        const upstream = publisherOf(policy.on);
        if (
          upstream &&
          map &&
          !map.relationships.some(
            relationship =>
              relationship.mechanism === 'integration-event' &&
              relationship.upstream === upstream &&
              relationship.downstream === context.id,
          )
        ) {
          problems.push(
            `${here}: a pivot from ${upstream} to ${context.id} the context map does not declare; a new relationship is a decision (CTX-MAP-DECLARED)`,
          );
        }
      }
      if (policy.kind === 'every-operation' && policy.on !== 'every operation')
        problems.push(`${here}: an every-operation policy is "on: every operation"`);
      for (const event of policy.events) {
        if (!knownEvents.has(event))
          problems.push(`${here}: reaches "${event}", which neither the code nor this storm brings to ${context.id}`);
      }
      for (const name of policy.publishes) {
        if (!pascal.test(name) || /IntegrationEvent$/.test(name))
          problems.push(`${here}: publishes "${name}", a public name without the IntegrationEvent suffix`);
      }
    }
  }
  for (const link of storm.links) {
    const here = `${where} link ${link.upstream} → ${link.downstream}`;
    if (!['integration-event', 'owned-port'].includes(link.mechanism))
      problems.push(`${here}: mechanism must be integration-event or owned-port (CTX-CONTRACTS)`);
    if (!link.contracts.length) problems.push(`${here}: names no contract`);
    if (
      map &&
      !map.relationships.some(
        relationship =>
          relationship.upstream === link.upstream &&
          relationship.downstream === link.downstream &&
          relationship.mechanism === link.mechanism,
      )
    ) {
      problems.push(
        `${here}: a relationship the context map does not declare; a new relationship is a decision (CTX-MAP-DECLARED), declared in conventions/domain.yaml first`,
      );
    }
  }
  return problems;
}

/** The inventory the code must say once the storm is carried: the current one plus the delta. */
export function expectedInventory(current: Inventory, storm: ExpectedStorm): Inventory {
  const expected: Inventory = JSON.parse(JSON.stringify(current));
  expected.language = `expected by ${storm.source}`;
  for (const delta of storm.contexts) {
    let context = expected.contexts.find(candidate => candidate.id === delta.id);
    if (!context) {
      context = { id: delta.id, commands: [], queries: [], events: [], policies: [] };
      expected.contexts.push(context);
    }
    const replace = <T extends { name: string }>(list: T[], item: T) => [
      ...list.filter(each => each.name !== item.name),
      item,
    ];
    for (const command of delta.commands) context.commands = replace(context.commands, command);
    for (const query of delta.queries) context.queries = replace(context.queries, query);
    context.events = [...new Set([...context.events, ...delta.events])];
    for (const policy of delta.policies) {
      context.policies = [
        ...context.policies.filter(each => !(each.on === policy.on && each.kind === policy.kind)),
        policy,
      ];
    }
  }
  for (const link of storm.links) {
    const same = expected.links.find(
      each =>
        each.upstream === link.upstream && each.downstream === link.downstream && each.mechanism === link.mechanism,
    );
    if (same) same.contracts = [...new Set([...same.contracts, ...link.contracts])];
    else expected.links.push(link);
  }
  return canonicalInventory(expected);
}

/** Whether the delta is already in the code: every item of it present in the actual inventory. */
function carried(storm: ExpectedStorm, actual: Inventory): { present: string[]; absent: string[] } {
  const present: string[] = [];
  const absent: string[] = [];
  const note = (found: boolean, what: string) => (found ? present : absent).push(what);
  for (const delta of storm.contexts) {
    const context = actual.contexts.find(candidate => candidate.id === delta.id);
    for (const command of delta.commands) {
      note(
        !!context?.commands.some(each => JSON.stringify(each) === JSON.stringify(command)),
        `${delta.id}: the command ${command.name}`,
      );
    }
    for (const query of delta.queries)
      note(
        !!context?.queries.some(each => JSON.stringify(each) === JSON.stringify(query)),
        `${delta.id}: the query ${query.name}`,
      );
    for (const event of delta.events) note(!!context?.events.includes(event), `${delta.id}: the event ${event}`);
    for (const policy of delta.policies) {
      note(
        !!context?.policies.some(each => JSON.stringify(each) === JSON.stringify(policy)),
        `${delta.id}: the policy on ${policy.on}`,
      );
    }
  }
  for (const link of storm.links) {
    note(
      actual.links.some(
        each =>
          each.upstream === link.upstream &&
          each.downstream === link.downstream &&
          each.mechanism === link.mechanism &&
          link.contracts.every(contract => each.contracts.includes(contract)),
      ),
      `the link ${link.upstream} → ${link.downstream} (${link.contracts.join(', ')})`,
    );
  }
  return { present, absent };
}

/**
 * The storm against the code: done, every difference between the expected inventory and the
 * actual one is a problem; not done, anything of the delta already carried is one (mark it done,
 * or the storm is stale).
 */
export function checkExpectedStorm(storm: ExpectedStorm, actual: Inventory): string[] {
  if (storm.done) {
    return compareInventories(expectedInventory(actual, storm), actual).map(
      difference => `${storm.source} is done, but ${difference}`,
    );
  }
  return carried(storm, actual).present.map(
    what => `${storm.source} is not done, yet the code already carries ${what}; mark it done or fix the storm`,
  );
}

/** `storm --expect`, in words: what the code still owes the storm, or that it is carried. */
export function describeExpectation(storm: ExpectedStorm, actual: Inventory): string {
  const { present, absent } = carried(storm, actual);
  const differences = compareInventories(expectedInventory(actual, storm), actual);
  const lines = [
    `${storm.feature} (${storm.done ? 'done' : 'planned'}): ${storm.intent.replace(/\s*\n\s*/g, ' ')}`,
    '',
  ];
  if (storm.hotSpots.length) {
    lines.push('Hot spots:');
    for (const hotSpot of storm.hotSpots)
      lines.push(
        `  ${hotSpot.decision ? '✓' : '?'} ${hotSpot.question}${hotSpot.decision ? ` — ${hotSpot.decision}` : ''}`,
      );
    lines.push('');
  }
  if (!differences.length) {
    lines.push(`The code carries the storm: the ${actual.language} inventory is the expected one.`);
    return lines.join('\n');
  }
  if (present.length) lines.push('Already carried:', ...present.map(what => `  ${what}`), '');
  lines.push(`Still owed by the code (${absent.length}):`, ...absent.map(what => `  ${what}`));
  const changes = changedByStorm(storm, actual);
  if (changes.length)
    lines.push('', 'Changed by this storm (the code has the earlier shape):', ...changes.map(each => `  ${each}`));
  return lines.join('\n');
}

/** The stickies the storm reshapes rather than adds: a command the code has under another shape, a link it widens. */
function changedByStorm(storm: ExpectedStorm, actual: Inventory): string[] {
  const changes: string[] = [];
  for (const delta of storm.contexts) {
    const context = actual.contexts.find(candidate => candidate.id === delta.id);
    if (!context) continue;
    for (const command of delta.commands) {
      const before = context.commands.find(each => each.name === command.name);
      if (before && JSON.stringify(before) !== JSON.stringify(command)) {
        changes.push(`${delta.id}: ${command.name} — ${describeCommand(before)} becomes ${describeCommand(command)}`);
      }
    }
    for (const query of delta.queries) {
      const before = context.queries.find(each => each.name === query.name);
      if (before && JSON.stringify(before) !== JSON.stringify(query))
        changes.push(`${delta.id}: ${query.name} — ${describeQuery(before)} becomes ${describeQuery(query)}`);
    }
    for (const policy of delta.policies) {
      const before = context.policies.find(each => each.on === policy.on && each.kind === policy.kind);
      if (before && JSON.stringify(before) !== JSON.stringify(policy))
        changes.push(`${delta.id}: ${describePolicy(before)} becomes ${describePolicy(policy)}`);
    }
  }
  for (const link of storm.links) {
    const before = actual.links.find(
      each =>
        each.upstream === link.upstream && each.downstream === link.downstream && each.mechanism === link.mechanism,
    );
    const added = link.contracts.filter(contract => !before?.contracts.includes(contract));
    if (before && added.length)
      changes.push(
        `the link ${link.upstream} → ${link.downstream} gains ${added.join(', ')} (it carries ${before.contracts.join(', ')})`,
      );
  }
  return changes;
}

/** The storm read from the code with the expected stickies laid over it, marked `expected`, for the board. */
export function overlayExpectedStorm(storm: EventStorm, expected: ExpectedStorm, actual: Inventory): EventStorm {
  const overlaid: EventStorm = JSON.parse(JSON.stringify(storm));
  const { absent } = carried(expected, actual);
  const missing = new Set(absent);
  for (const delta of expected.contexts) {
    let context = overlaid.contexts.find(candidate => candidate.id === delta.id);
    if (!context) {
      context = { id: delta.id, aggregates: [], events: [], commands: [], policies: [], readModels: [], externals: [] };
      overlaid.contexts.push(context);
    }
    for (const event of delta.events) {
      if (!missing.has(`${delta.id}: the event ${event}`)) continue;
      const sticky: StormEvent = { name: event, aggregate: '', recordedBy: [], policies: [], expected: true };
      context.events.push(sticky);
    }
    for (const command of delta.commands) {
      if (!missing.has(`${delta.id}: the command ${command.name}`)) continue;
      const sticky: StormCommand = {
        name: command.name,
        handler: '',
        file: '',
        actor: command.actor as StormCommand['actor'],
        ...(command.route && { route: command.route }),
        ...(command.aggregate && { aggregate: command.aggregate }),
        behaviours: [],
        events: command.events,
        services: [],
        uses: [],
        expected: true,
      };
      context.commands.push(sticky);
    }
    for (const query of delta.queries) {
      if (!missing.has(`${delta.id}: the query ${query.name}`)) continue;
      const sticky: StormReadModel = {
        name: query.name,
        handler: '',
        model: '',
        actor: query.actor as StormReadModel['actor'],
        ...(query.route && { route: query.route }),
        expected: true,
      };
      context.readModels.push(sticky);
    }
    for (const policy of delta.policies) {
      if (!missing.has(`${delta.id}: the policy on ${policy.on}`)) continue;
      const sticky: StormPolicy = {
        name: `on ${policy.on}`,
        file: '',
        on: { kind: policy.kind, event: policy.on },
        publishes: policy.publishes,
        dispatches: [],
        behaviours: [],
        events: policy.events,
        services: [],
        uses: [],
        expected: true,
      };
      context.policies.push(sticky);
    }
  }
  return overlaid;
}
