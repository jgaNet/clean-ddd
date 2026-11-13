import { execFileSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { load } from 'js-yaml';

import type { Inventory } from './inventory';
import {
  ContractError,
  PAYLOAD_TYPES,
  Payload,
  PayloadType,
  PublishedEvent,
  PublishedLanguage,
  PublishedVersion,
} from './types';

/**
 * The published language: conventions/integration-events.yaml (ADR 44). Every integration event a
 * context publishes, declared once for every language — its public name, the context that publishes it,
 * the thing it announces when it announces one, and the payload of each version it has been published
 * in. Like the domain map, it names no file of any language.
 *
 * Each language's tool writes the payload of every integration event its tree publishes into its
 * inventory (`integrationEvents`), in the six words of the file; the check holds every inventory to the
 * last version of each event (`checkInventoryAgainstPublishedLanguage`), and the gate refuses a version
 * of the base changed in the head (`frozenVersionChanges`), unless the change is an added optional
 * field (CTX-PUBLISHED-LANGUAGE).
 *
 * A tree with no file has declared no event: every function here then has nothing to say.
 */

export const PUBLISHED_LANGUAGE_FILE = 'conventions/integration-events.yaml';

type Raw = Record<string, unknown>;
const isObject = (value: unknown): value is Raw => typeof value === 'object' && value !== null && !Array.isArray(value);
const byName = (a: string, b: string) => a.localeCompare(b);

/** A text that is not yet known to be a published language: a mapping with `events`, a mapping too. */
export function parsePublishedLanguage(text: string, source: string = PUBLISHED_LANGUAGE_FILE): PublishedLanguage {
  const raw = load(text);
  if (!isObject(raw)) throw new ContractError(`${source} is not a YAML mapping`, 'malformed');
  // `events: {}` is the file of an application that publishes nothing yet; `events:` alone says the same.
  const events = raw.events ?? {};
  if (!isObject(events))
    throw new ContractError(`${source}: "events" must be a mapping of public names to events`, 'malformed');
  return {
    source,
    events: Object.entries(events).map(([name, entry]): PublishedEvent => {
      const event = isObject(entry) ? entry : {};
      const announces = isObject(event.announces) ? event.announces : undefined;
      return {
        name,
        publisher: typeof event.publisher === 'string' ? event.publisher : '',
        ...(announces && { announces: { thing: String(announces.thing ?? ''), id: String(announces.id ?? '') } }),
        versions: (Array.isArray(event.versions) ? event.versions : []).map((version): PublishedVersion => ({
          version: isObject(version) && typeof version.version === 'number' ? version.version : Number.NaN,
          payload: Object.fromEntries(
            Object.entries(isObject(version) && isObject(version.payload) ? version.payload : {}).map(
              ([field, type]) => [field, String(type) as PayloadType],
            ),
          ),
        })),
      };
    }),
  };
}

/** The published language, or undefined when the repository has none; throws a ContractError when the file is not one. */
export function loadPublishedLanguage(root: string): PublishedLanguage | undefined {
  const path = join(root, PUBLISHED_LANGUAGE_FILE);
  if (!existsSync(path)) return undefined;
  return parsePublishedLanguage(readFileSync(path, 'utf8'));
}

const TYPE = new RegExp(`^(${PAYLOAD_TYPES.join('|')})\\??$`);
const FIELD = /^[a-z][A-Za-z0-9]*$/;
const PUBLIC_NAME = /^[A-Z][A-Za-z0-9]*$/;

/** The last version of an event: the one every language's code carries. */
export const lastVersion = (event: PublishedEvent): PublishedVersion | undefined =>
  event.versions[event.versions.length - 1];

/**
 * Everything the file can get wrong on its own and against the contexts (those of the domain map, or,
 * with no map, those the binding declares): a public name without the suffix of its kind; a publisher
 * that is a context; versions numbered 1, 2, … in order, each with a payload of lowerCamel fields typed
 * in the six words; an `announces` whose id field is a `string` of the last version's payload.
 */
export function validatePublishedLanguage(language: PublishedLanguage, contexts: string[]): string[] {
  const problems: string[] = [];
  const rule = 'CTX-PUBLISHED-LANGUAGE';
  for (const event of language.events) {
    const where = `${rule}: ${language.source} event ${event.name}`;
    if (!PUBLIC_NAME.test(event.name) || /IntegrationEvent$/.test(event.name))
      problems.push(
        `${where}: the name is not a public name (PascalCase, without the suffix of its kind: NoteShared, not NoteSharedIntegrationEvent)`,
      );
    if (!event.publisher) problems.push(`${where}: "publisher" is missing`);
    else if (!contexts.includes(event.publisher))
      problems.push(
        `${where}: publisher ${event.publisher} is not a context of the domain map (${contexts.join(', ') || 'none'})`,
      );
    if (!event.versions.length) problems.push(`${where}: "versions" is missing or empty; the first is version 1`);
    event.versions.forEach((version, index) => {
      if (version.version !== index + 1)
        problems.push(
          `${where}: version ${Number.isNaN(version.version) ? '(no number)' : version.version} is listed ${ordinal(index + 1)}; versions are numbered 1, 2, … oldest first`,
        );
      for (const [field, type] of Object.entries(version.payload)) {
        if (!FIELD.test(field))
          problems.push(`${where}, version ${index + 1}: the field ${field} is not a public name in lowerCamel`);
        if (!TYPE.test(type))
          problems.push(
            `${where}, version ${index + 1}: the field ${field} is "${type}", not one of ${PAYLOAD_TYPES.join(', ')} (with "?" when it may be absent)`,
          );
      }
    });
    if (event.announces) {
      const last = lastVersion(event);
      const type = last?.payload[event.announces.id];
      if (!event.announces.thing) problems.push(`${where}: "announces" names no thing`);
      if (type !== 'string')
        problems.push(
          `${where}: announces ${event.announces.thing || 'a thing'} by the field ${event.announces.id || '(none)'}, which ${type === undefined ? 'is not a field of' : `is "${type}" in`} the last version's payload; the id a thing was born with is a string the event carries (DOMAIN-IDENTITY)`,
        );
    }
  }
  return problems;
}

const ordinal = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;

/** A payload in words: `{ noteId: string, title: string? }`. */
export const describePayload = (payload: Payload): string =>
  `{ ${Object.entries(payload)
    .map(([field, type]) => `${field}: ${type}`)
    .join(', ')} }`;

/** What differs between two payloads, field by field: missing, extra, of another type. Empty: the same. */
export function payloadDifferences(declared: Payload, carried: Payload): string[] {
  const differences: string[] = [];
  for (const field of Object.keys(declared).sort(byName)) {
    if (!(field in carried)) differences.push(`${field} (${declared[field]}) is missing`);
    else if (carried[field] !== declared[field])
      differences.push(`${field} is ${carried[field]}, declared ${declared[field]}`);
  }
  for (const field of Object.keys(carried).sort(byName)) {
    if (!(field in declared)) differences.push(`${field} (${carried[field]}) is not declared`);
  }
  return differences;
}

/**
 * Where one language's inventory differs from the published language, one line each, under
 * CTX-PUBLISHED-LANGUAGE: an event the tree publishes and the file does not declare, an event declared
 * and published by none, another publisher, another payload than the last version's. An inventory
 * written before ADR 44 has no `integrationEvents`: that is said once, for the language.
 */
export function checkInventoryAgainstPublishedLanguage(language: PublishedLanguage, inventory: Inventory): string[] {
  const who = inventory.language;
  const rule = 'CTX-PUBLISHED-LANGUAGE';
  if (!inventory.integrationEvents) {
    return language.events.length
      ? [
          `${rule}: ${who}: its inventory records no integrationEvents, so nothing holds its payloads to ${language.source}; its tool writes them (ADR 44)`,
        ]
      : [];
  }
  const problems: string[] = [];
  const carried = inventory.integrationEvents;
  for (const event of language.events) {
    const found = carried.filter(each => each.name === event.name);
    if (!found.length) {
      problems.push(
        `${rule}: ${who}: ${event.name} is declared in ${language.source}, published by ${event.publisher}, and the ${who} tree publishes it nowhere`,
      );
      continue;
    }
    for (const each of found) {
      if (each.publisher !== event.publisher)
        problems.push(
          `${rule}: ${who}: ${event.name} is published by ${each.publisher}, and ${language.source} says ${event.publisher}`,
        );
    }
    const last = lastVersion(event);
    if (!last) continue;
    for (const each of found) {
      const differences = payloadDifferences(last.payload, each.payload);
      if (differences.length)
        problems.push(
          `${rule}: ${who}: ${event.name}'s payload is not version ${last.version} of ${language.source}: ${differences.join('; ')}`,
        );
    }
  }
  const declared = new Set(language.events.map(event => event.name));
  for (const each of carried) {
    if (!declared.has(each.name))
      problems.push(
        `${rule}: ${who}: ${each.publisher} publishes ${each.name} ${describePayload(each.payload)}, which ${language.source} does not declare; declare it before the code publishes it`,
      );
  }
  return problems;
}

/**
 * The changes the gate refuses (ADR 44): a version present at the base that changed in the head — a field
 * removed, renamed or retyped, a version removed or renumbered — unless the only change is an added optional
 * field. An event removed whole is allowed (its publishers and consumers go with it), and a version appended
 * is how a breaking change is said.
 */
export function frozenVersionChanges(before: PublishedLanguage, after: PublishedLanguage): string[] {
  const problems: string[] = [];
  const rule = 'CTX-PUBLISHED-LANGUAGE';
  for (const event of before.events) {
    const now = after.events.find(each => each.name === event.name);
    if (!now) continue;
    for (const version of event.versions) {
      const where = `${rule}: ${after.source}: ${event.name} version ${version.version}`;
      const twin = now.versions.find(each => each.version === version.version);
      if (!twin) {
        problems.push(`${where} was merged and is gone; a version once merged stays in the history`);
        continue;
      }
      const changed: string[] = [];
      for (const [field, type] of Object.entries(version.payload)) {
        if (!(field in twin.payload)) changed.push(`${field} (${type}) removed`);
        else if (twin.payload[field] !== type) changed.push(`${field} ${type} → ${twin.payload[field]}`);
      }
      for (const [field, type] of Object.entries(twin.payload)) {
        if (!(field in version.payload) && !type.endsWith('?'))
          changed.push(`${field} (${type}) added, and it is not optional`);
      }
      if (changed.length)
        problems.push(
          `${where} was changed in place: ${changed.join('; ')}; append version ${now.versions.length + 1} instead (only an added optional field may change a merged version)`,
        );
    }
  }
  return problems;
}

/**
 * The published language as it was at the base the gate compares with (its merge base with HEAD, or HEAD
 * itself for `working`), read with git; undefined when the base had no file or it cannot be read.
 */
export function publishedLanguageAt(base: string, root: string): PublishedLanguage | undefined {
  const git = (args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' });
  let at = 'HEAD';
  if (base !== 'working') {
    try {
      at = git(['merge-base', base, 'HEAD']).trim();
    } catch {
      at = base;
    }
  }
  try {
    return parsePublishedLanguage(git(['show', `${at}:${PUBLISHED_LANGUAGE_FILE}`]));
  } catch {
    return undefined;
  }
}
