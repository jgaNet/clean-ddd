import { existsSync, readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { load } from 'js-yaml';

import {
  ArchitectureContract,
  Checklist,
  Concept,
  ContractError,
  Enforcement,
  Rule,
  SUPPORTED_SCHEMA_VERSION,
  TestRow,
  Verb,
  VocabularyRow,
} from './types';

/**
 * Loads the two YAML files into one typed contract. Throws a ContractError when a file is not a
 * contract at all (missing schemaVersion, unsupported version, missing top-level keys); every
 * other problem (a duplicate id, a reference to nothing) is reported by validateContract(), so
 * that a check can list them all at once.
 */

export const repositoryRoot = (): string => resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const SOURCES = { architecture: 'conventions/architecture.yaml', concepts: 'conventions/concepts.yaml' };
const ENFORCEMENTS: Enforcement[] = ['eslint', 'check', 'types', 'tests', 'review', 'evaluations'];

type Raw = Record<string, unknown>;
const isObject = (value: unknown): value is Raw => typeof value === 'object' && value !== null && !Array.isArray(value);
const strings = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : []);

function readYaml(root: string, file: string): Raw {
  const path = join(root, file);
  if (!existsSync(path)) throw new ContractError(`${file} not found under ${root}`, 'malformed');
  const raw = load(readFileSync(path, 'utf8'));
  if (!isObject(raw)) throw new ContractError(`${file} is not a YAML mapping`, 'malformed');
  const version = raw.schemaVersion;
  if (typeof version !== 'number') throw new ContractError(`${file} has no schemaVersion`, 'malformed');
  if (version !== SUPPORTED_SCHEMA_VERSION) {
    throw new ContractError(
      `${file} is schemaVersion ${version}; this tooling understands ${SUPPORTED_SCHEMA_VERSION}`,
      'unsupported-schema-version',
    );
  }
  return raw;
}

function require<T>(raw: Raw, key: string, file: string, guard: (value: unknown) => value is T): T {
  const value = raw[key];
  if (!guard(value)) throw new ContractError(`${file}: "${key}" is missing or malformed`, 'malformed');
  return value;
}

const isTree = (value: unknown): value is { alias: string; path: string } =>
  isObject(value) && typeof value.alias === 'string' && typeof value.path === 'string';

/** A layer's entry in the table becomes a dependency rule: its statement is what it may import. */
function dependencyRule(layer: string, entry: Raw, whatFor: string): Rule {
  const mayImport = strings(entry.may_import);
  return {
    id: String(entry.id ?? ''),
    name: `${layer.toLowerCase()}-may-import`,
    statement:
      typeof entry.statement === 'string'
        ? entry.statement
        : `${whatFor} may import ${mayImport.join(', ')}; nothing else.`,
    why: String(entry.why ?? ''),
    remediation: String(entry.remediation ?? ''),
    enforcement: 'eslint',
    references: strings(entry.references),
    dependency: { layer, mayImport },
  };
}

export function loadArchitectureContract(root: string = repositoryRoot()): ArchitectureContract {
  const architecture = readYaml(root, SOURCES.architecture);
  const concepts = readYaml(root, SOURCES.concepts);

  const layersRaw = require(architecture, 'layers', SOURCES.architecture, isObject);
  const rules: Rule[] = [];
  for (const [layer, entry] of Object.entries(layersRaw)) {
    if (!isObject(entry)) throw new ContractError(`${SOURCES.architecture}: layer ${layer} is malformed`, 'malformed');
    rules.push(dependencyRule(layer, entry, `A file in the ${layer} layer`));
    if (isObject(entry.specs)) {
      rules.push(dependencyRule(`${layer} specs`, entry.specs, `A spec in the ${layer} layer, in addition,`));
    }
  }
  for (const [key, whatFor] of [
    ['wiring_file', 'A wiring file (module.local.ts)'],
    ['e2e_specs', 'An end-to-end spec'],
    ['relative_imports', 'A relative import'],
  ] as const) {
    const entry = architecture[key];
    if (isObject(entry)) rules.push(dependencyRule(key, entry, whatFor));
  }
  for (const entry of require(architecture, 'rules', SOURCES.architecture, Array.isArray)) {
    if (!isObject(entry)) throw new ContractError(`${SOURCES.architecture}: a rule is not a mapping`, 'malformed');
    rules.push({
      id: String(entry.id ?? ''),
      name: String(entry.name ?? ''),
      statement: String(entry.statement ?? ''),
      why: String(entry.why ?? ''),
      remediation: String(entry.remediation ?? ''),
      enforcement: entry.enforcement as Enforcement,
      references: strings(entry.references),
    });
  }

  const conceptList: Concept[] = require(concepts, 'concepts', SOURCES.concepts, Array.isArray).map(entry => {
    if (!isObject(entry)) throw new ContractError(`${SOURCES.concepts}: a concept is not a mapping`, 'malformed');
    return {
      id: String(entry.id ?? ''),
      name: String(entry.name ?? ''),
      layer: entry.layer as Concept['layer'],
      canonical: strings(entry.canonical),
      examples: strings(entry.examples),
      example: typeof entry.example === 'string' ? entry.example : undefined,
      description: String(entry.description ?? ''),
      rules: strings(entry.rules),
      references: strings(entry.references),
    };
  });

  return {
    schemaVersion: SUPPORTED_SCHEMA_VERSION,
    contexts: strings(require(architecture, 'contexts', SOURCES.architecture, Array.isArray)),
    architecture: require(architecture, 'architecture', SOURCES.architecture, isTree),
    kernel: require(architecture, 'kernel', SOURCES.architecture, isTree),
    wiring: String(architecture.wiring ?? 'module.local.ts'),
    libraries: strings(architecture.libraries),
    layers: Object.keys(layersRaw),
    rules,
    concepts: conceptList,
    verbs: ((architecture.http as { verbs?: Verb[] } | undefined)?.verbs ?? []).map(verb => ({ ...verb })),
    checklists: Object.entries((architecture.checklists as Record<string, Omit<Checklist, 'kind'>>) ?? {}).map(
      ([kind, entry]) => ({ kind, ...entry }),
    ),
    tests: (concepts.tests as TestRow[] | undefined) ?? [],
    vocabulary: (concepts.vocabulary as VocabularyRow[] | undefined) ?? [],
    sources: SOURCES,
  };
}

/** Everything a loaded contract can still get wrong, one line each; empty means the contract is sound. */
export function validateContract(contract: ArchitectureContract, root: string = repositoryRoot()): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  const idShape = /^[A-Z]+-[A-Z0-9-]+$/;

  for (const rule of contract.rules) {
    const where = `${contract.sources.architecture} rule "${rule.id || '(no id)'}"`;
    if (!rule.id) problems.push(`${where}: has no id`);
    else if (!idShape.test(rule.id)) problems.push(`${where}: id must look like CATEGORY-NAME (uppercase)`);
    if (ids.has(rule.id)) problems.push(`${where}: duplicate id`);
    ids.add(rule.id);
    for (const field of ['statement', 'why', 'remediation'] as const) {
      if (!rule[field]) problems.push(`${where}: "${field}" is missing`);
    }
    if (!ENFORCEMENTS.includes(rule.enforcement)) {
      problems.push(`${where}: enforcement must be one of ${ENFORCEMENTS.join(', ')}`);
    }
    for (const reference of rule.references) {
      if (!existsSync(join(root, reference))) problems.push(`${where}: references ${reference}, which does not exist`);
    }
  }

  for (const verb of contract.verbs) {
    const where = `${contract.sources.architecture} verb "${verb.intent}"`;
    for (const field of ['verb', 'shape', 'when', 'example'] as const) {
      if (!verb[field]) problems.push(`${where}: "${field}" is missing`);
    }
    if (verb.example && !existsSync(join(root, verb.example))) {
      problems.push(`${where}: names ${verb.example}, which does not exist`);
    }
  }

  const conceptIds = new Set<string>();
  for (const concept of contract.concepts) {
    const where = `${contract.sources.concepts} concept "${concept.id || '(no id)'}"`;
    if (!concept.id) problems.push(`${where}: has no id`);
    if (conceptIds.has(concept.id)) problems.push(`${where}: duplicate id`);
    conceptIds.add(concept.id);
    if (!['domain', 'application', 'infrastructure', 'presentation'].includes(concept.layer)) {
      problems.push(
        `${where}: layer "${concept.layer}" is not one of domain, application, infrastructure, presentation`,
      );
    }
    if (!concept.canonical.length) problems.push(`${where}: names no canonical file`);
    for (const file of [...concept.canonical, ...concept.examples, ...concept.references]) {
      if (!existsSync(join(root, file))) problems.push(`${where}: names ${file}, which does not exist`);
    }
    for (const reference of concept.references) {
      if (!reference.startsWith('docs/adr/')) problems.push(`${where}: reference ${reference} is not an ADR`);
    }
    for (const ruleId of concept.rules) {
      if (!ids.has(ruleId))
        problems.push(`${where}: names the rule ${ruleId}, which architecture.yaml does not define`);
    }
  }
  for (const checklist of contract.checklists) {
    const where = `${contract.sources.architecture} checklist "${checklist.kind}"`;
    if (!checklist.place) problems.push(`${where}: "place" is missing`);
    if (!checklist.parts.length) problems.push(`${where}: lists no parts`);
    if (checklist.concept && !conceptIds.has(checklist.concept)) {
      problems.push(`${where}: names the concept ${checklist.concept}, which concepts.yaml does not define`);
    }
  }
  return problems;
}
