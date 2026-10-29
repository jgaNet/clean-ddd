import { existsSync, readFileSync } from 'fs';
import { dirname, join, posix, resolve } from 'path';
import { load } from 'js-yaml';

import {
  ArchitectureContract,
  Checklist,
  Concept,
  ContractError,
  Enforcement,
  Language,
  Rule,
  SUPPORTED_SCHEMA_VERSION,
  Mode,
  ModeName,
  TestRow,
  Tree,
  Verb,
  VocabularyRow,
} from './types';

/**
 * Loads the three YAML files — the contract (architecture.yaml), the concepts (concepts.yaml)
 * and one language's binding (<language>.yaml) — into one typed contract. Throws a
 * ContractError when a file is not a contract at all (missing schemaVersion, unsupported
 * version, missing top-level keys); every other problem (a duplicate id, a reference to
 * nothing, a binding naming a rule the contract does not have) is reported by
 * validateContract(), so that a check can list them all at once.
 *
 * One root: the *repository root*, the nearest directory at or above where the command was
 * typed that holds `conventions/`. Every path a loaded contract carries is relative to it,
 * whichever file it came from. A language's own directory is what its binding's `root` says —
 * `typescript/` in the reference, `.` in an application `clean-ddd create` made.
 */

/** The language a command answers for when nothing names one: the one whose tree this tooling reads. */
export const DEFAULT_LANGUAGE = 'typescript';

const CONTRACT = 'conventions/architecture.yaml';

/** Where a command was typed: `yarn` records it as INIT_CWD, and that is where a typed path is read from. */
export const typedFrom = (): string => process.env.INIT_CWD ?? process.cwd();

/** The nearest directory at or above `from` that holds the contract. */
export function repositoryRoot(from: string = typedFrom()): string {
  let dir = resolve(from);
  for (;;) {
    if (existsSync(join(dir, CONTRACT))) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new ContractError(`${CONTRACT} not found at or above ${from}`, 'malformed');
    dir = parent;
  }
}

/** The language a contract answers for by default: the reference's, or the first the contract lists. */
export function defaultLanguage(root: string): string {
  const languages = strings(readYaml(root, CONTRACT).languages);
  return languages.includes(DEFAULT_LANGUAGE) ? DEFAULT_LANGUAGE : (languages[0] ?? DEFAULT_LANGUAGE);
}

const sourcesFor = (language: string) => ({
  architecture: CONTRACT,
  concepts: 'conventions/concepts.yaml',
  binding: `conventions/${language}.yaml`,
});
const ENFORCEMENTS: Enforcement[] = ['linter', 'check', 'types', 'tests', 'review', 'evaluations'];

type Raw = Record<string, unknown>;
const isObject = (value: unknown): value is Raw => typeof value === 'object' && value !== null && !Array.isArray(value);
const strings = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : []);
const text = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

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

const isTree = (value: unknown): value is Tree =>
  isObject(value) && typeof value.alias === 'string' && typeof value.path === 'string';

/**
 * A binding's paths are written relative to its own directory; a loaded contract speaks
 * repository-relative paths, so that a document, a diff and a tool all name the same file.
 */
export const isLocalLink = (target: string): boolean => !/^([a-z]+:|#|\/)/i.test(target);

function prefixer(language: Language) {
  const prefix = (path: string): string => (language.root === '.' ? path : posix.join(language.root, path));
  const markdown = (value: string | undefined): string | undefined =>
    value?.replace(/\]\(([^)\s]+)\)/g, (whole, target: string) =>
      isLocalLink(target) ? `](${prefix(target)})` : whole,
    );
  return { path: prefix, paths: (values: unknown) => strings(values).map(prefix), markdown };
}

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
    enforcement: 'linter',
    references: strings(entry.references),
    examples: [],
    dependency: { layer, mayImport },
  };
}

export function loadArchitectureContract(
  root: string = repositoryRoot(),
  language: string = defaultLanguage(root),
): ArchitectureContract {
  const sources = sourcesFor(language);
  const architecture = readYaml(root, sources.architecture);
  const concepts = readYaml(root, sources.concepts);
  const binding = readYaml(root, sources.binding);

  const languageOf: Language = {
    id: String(binding.language ?? language),
    name: String(binding.name ?? language),
    root: posix.normalize(String(binding.root ?? '.')),
  };
  const local = prefixer(languageOf);
  const tree = (key: string): Tree => {
    const value = require(binding, key, sources.binding, isTree);
    return { alias: value.alias, path: local.path(value.path) };
  };

  // The rules: the table's rows, the two kinds of file that are not a layer, then the rest.
  const layersRaw = require(architecture, 'layers', sources.architecture, isObject);
  const rules: Rule[] = [];
  for (const [layer, entry] of Object.entries(layersRaw)) {
    if (!isObject(entry)) throw new ContractError(`${sources.architecture}: layer ${layer} is malformed`, 'malformed');
    rules.push(dependencyRule(layer, entry, `A file in the ${layer} layer`));
    if (isObject(entry.specs)) {
      rules.push(dependencyRule(`${layer} specs`, entry.specs, `A spec in the ${layer} layer, in addition,`));
    }
  }
  for (const [key, whatFor] of [
    ['wiring_file', 'A wiring file'],
    ['e2e_specs', 'An end-to-end spec'],
    ['relative_imports', 'A relative import'],
  ] as const) {
    const entry = architecture[key];
    if (isObject(entry)) rules.push(dependencyRule(key, entry, whatFor));
  }
  for (const entry of require(architecture, 'rules', sources.architecture, Array.isArray)) {
    if (!isObject(entry)) throw new ContractError(`${sources.architecture}: a rule is not a mapping`, 'malformed');
    rules.push({
      id: String(entry.id ?? ''),
      name: String(entry.name ?? ''),
      statement: String(entry.statement ?? ''),
      why: String(entry.why ?? ''),
      remediation: String(entry.remediation ?? ''),
      enforcement: entry.enforcement as Enforcement,
      references: strings(entry.references),
      examples: [],
    });
  }
  // What the binding adds to a rule: the files that show it. A binding may not add a rule.
  const boundRules = isObject(binding.rules) ? binding.rules : {};
  for (const [id, entry] of Object.entries(boundRules)) {
    const rule = rules.find(candidate => candidate.id === id);
    if (rule && isObject(entry)) rule.examples = local.paths(entry.references);
  }

  const boundConcepts = isObject(binding.concepts) ? binding.concepts : {};
  const conceptList: Concept[] = require(concepts, 'concepts', sources.concepts, Array.isArray).map(entry => {
    if (!isObject(entry)) throw new ContractError(`${sources.concepts}: a concept is not a mapping`, 'malformed');
    const id = String(entry.id ?? '');
    const bound = isObject(boundConcepts[id]) ? (boundConcepts[id] as Raw) : {};
    return {
      id,
      name: String(entry.name ?? ''),
      layer: entry.layer as Concept['layer'],
      canonical: local.paths(bound.canonical),
      examples: local.paths(bound.examples),
      example: local.markdown(text(bound.example)),
      description: String(entry.description ?? ''),
      notes: local.markdown(text(bound.notes)),
      rules: strings(entry.rules),
      references: strings(entry.references),
    };
  });

  const boundVerbs = isObject(binding.verbs) ? binding.verbs : {};
  const verbs: Verb[] = ((architecture.http as { verbs?: Verb[] } | undefined)?.verbs ?? []).map(verb => {
    const example = text(boundVerbs[verb.intent]);
    return {
      intent: verb.intent,
      verb: verb.verb,
      shape: verb.shape,
      when: verb.when,
      ...(example && { example: local.path(example) }),
    };
  });

  const boundChecklists = isObject(binding.checklists) ? binding.checklists : {};
  const checklists: Checklist[] = Object.entries(
    (architecture.checklists as Record<string, { concept?: string }> | undefined) ?? {},
  ).map(([kind, entry]) => {
    const bound = isObject(boundChecklists[kind]) ? (boundChecklists[kind] as Raw) : {};
    return {
      kind,
      concept: String(entry.concept ?? ''),
      place: bound.place ? local.path(String(bound.place)) : '',
      parts: strings(bound.parts),
    };
  });

  const coreModes = (architecture.modes as Record<ModeName, Mode> | undefined) ?? ({} as Record<ModeName, Mode>);
  const boundModes: Partial<Record<ModeName, Partial<Mode>>> =
    (binding.modes as Partial<Record<ModeName, Partial<Mode>>> | undefined) ?? {};
  const modes = {} as Record<ModeName, Mode>;
  for (const name of Object.keys(coreModes) as ModeName[]) {
    const core = coreModes[name];
    const bound = boundModes[name] ?? {};
    modes[name] = {
      why: core.why,
      protected: [...(core.protected ?? []), ...local.paths(bound.protected)],
      allowed: [...(core.allowed ?? []), ...local.paths(bound.allowed)],
      decides: [...(core.decides ?? []), ...local.paths(bound.decides)],
      records: core.records,
    };
  }

  const boundVocabulary = isObject(binding.vocabulary) ? binding.vocabulary : {};
  const vocabulary: VocabularyRow[] = (
    (concepts.vocabulary as { word: string; meaning: string }[] | undefined) ?? []
  ).map(row => ({ word: row.word, meaning: row.meaning, see: local.markdown(text(boundVocabulary[row.word])) ?? '' }));

  const tests: TestRow[] = ((binding.tests as TestRow[] | undefined) ?? []).map(row => ({
    layer: row.layer,
    example: local.markdown(row.example) ?? '',
    doubles: local.markdown(row.doubles) ?? '',
  }));

  const create = isObject(binding.create)
    ? {
        copy: local.paths(binding.create.copy),
        contracts: local.path(String(binding.create.contracts ?? '')),
        manifest: local.path(String(binding.create.manifest ?? '')),
        members: strings(binding.create.members),
        dependencies: strings(binding.create.dependencies),
        devDependencies: strings(binding.create.devDependencies),
        scripts: strings(binding.create.scripts),
        inventory: binding.create.inventory === true,
        install: String(binding.create.install ?? ''),
        test: String(binding.create.test ?? ''),
      }
    : undefined;

  return {
    schemaVersion: SUPPORTED_SCHEMA_VERSION,
    languages: strings(architecture.languages),
    language: languageOf,
    contexts: strings(require(binding, 'contexts', sources.binding, Array.isArray)),
    contextsTree: tree('contexts_tree'),
    architecture: tree('architecture'),
    kernel: tree('kernel'),
    bootstrap: tree('bootstrap'),
    wiring: String(binding.wiring ?? 'module.local.ts'),
    libraries: strings(binding.libraries),
    enforcers: (isObject(binding.enforcers) ? binding.enforcers : {}) as Record<Enforcement, string>,
    checks: strings(binding.checks),
    ...(create && { create }),
    layers: Object.keys(layersRaw),
    rules,
    concepts: conceptList,
    verbs,
    checklists,
    modes,
    tests,
    vocabulary,
    sources,
  };
}

/** Everything a loaded contract can still get wrong, one line each; empty means the contract is sound. */
export function validateContract(contract: ArchitectureContract, root: string = repositoryRoot()): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  const idShape = /^[A-Z]+-[A-Z0-9-]+$/;
  const exists = (path: string) => existsSync(join(root, path));
  const { architecture: contractFile, concepts: conceptsFile, binding: bindingFile } = contract.sources;

  if (!contract.languages.includes(contract.language.id)) {
    problems.push(
      `${bindingFile}: the language ${contract.language.id} is not in "languages" of ${contractFile}, so the map does not know it`,
    );
  }
  if (!existsSync(join(root, contract.language.root))) {
    problems.push(`${bindingFile}: "root" names ${contract.language.root}, which does not exist`);
  }
  for (const word of ENFORCEMENTS) {
    if (!contract.enforcers[word]) problems.push(`${bindingFile}: "enforcers" does not say what holds "${word}" here`);
  }

  for (const rule of contract.rules) {
    const where = `${contractFile} rule "${rule.id || '(no id)'}"`;
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
      if (!exists(reference)) problems.push(`${where}: references ${reference}, which does not exist`);
      if (
        /\.(ts|js|rs|py|go|java|kt|cs)$/.test(reference) ||
        reference.includes('/src/') ||
        reference.startsWith('src/')
      ) {
        problems.push(
          `${where}: references ${reference}, a file of one language; the contract names decisions, a binding names files (ARCH-ONE-CONTRACT)`,
        );
      }
    }
    for (const example of rule.examples) {
      if (!exists(example)) problems.push(`${bindingFile} rule "${rule.id}": names ${example}, which does not exist`);
    }
  }
  // A binding may point at a rule, never add one (ARCH-ONE-CONTRACT).
  const bindingRaw = load(readFileSync(join(root, bindingFile), 'utf8')) as Raw;
  for (const id of Object.keys(isObject(bindingRaw.rules) ? bindingRaw.rules : {})) {
    if (!ids.has(id)) {
      problems.push(
        `${bindingFile}: names the rule ${id}, which ${contractFile} does not define; a language never carries a rule of its own (ARCH-ONE-CONTRACT)`,
      );
    }
  }

  for (const verb of contract.verbs) {
    const where = `${contractFile} verb "${verb.intent}"`;
    for (const field of ['verb', 'shape', 'when'] as const) {
      if (!verb[field]) problems.push(`${where}: "${field}" is missing`);
    }
    // An example is a route where the shape is used; an application that has no routes yet has none.
    if (verb.example && !exists(verb.example)) {
      problems.push(`${bindingFile} verb "${verb.intent}": names ${verb.example}, which does not exist`);
    }
  }
  const intents = new Set(contract.verbs.map(verb => verb.intent));
  for (const intent of Object.keys(isObject(bindingRaw.verbs) ? bindingRaw.verbs : {})) {
    if (!intents.has(intent))
      problems.push(`${bindingFile}: names the verb ${intent}, which ${contractFile} does not define`);
  }

  const conceptIds = new Set<string>();
  for (const concept of contract.concepts) {
    const where = `${conceptsFile} concept "${concept.id || '(no id)'}"`;
    if (!concept.id) problems.push(`${where}: has no id`);
    if (conceptIds.has(concept.id)) problems.push(`${where}: duplicate id`);
    conceptIds.add(concept.id);
    if (!['domain', 'application', 'infrastructure', 'presentation'].includes(concept.layer)) {
      problems.push(
        `${where}: layer "${concept.layer}" is not one of domain, application, infrastructure, presentation`,
      );
    }
    if (/\]\((?!docs\/)[^)]*\)/.test(concept.description)) {
      problems.push(`${where}: the description links to a file; only a binding names files (ARCH-ONE-CONTRACT)`);
    }
    for (const file of [...concept.canonical, ...concept.examples]) {
      if (!exists(file)) problems.push(`${bindingFile} concept "${concept.id}": names ${file}, which does not exist`);
    }
    for (const reference of concept.references) {
      if (!exists(reference)) problems.push(`${where}: names ${reference}, which does not exist`);
      if (!reference.startsWith('docs/adr/')) problems.push(`${where}: reference ${reference} is not an ADR`);
    }
    for (const ruleId of concept.rules) {
      if (!ids.has(ruleId)) problems.push(`${where}: names the rule ${ruleId}, which ${contractFile} does not define`);
    }
  }
  for (const id of Object.keys(isObject(bindingRaw.concepts) ? bindingRaw.concepts : {})) {
    if (!conceptIds.has(id))
      problems.push(`${bindingFile}: names the concept ${id}, which ${conceptsFile} does not define`);
  }
  const words = new Set(contract.vocabulary.map(row => row.word));
  for (const word of Object.keys(isObject(bindingRaw.vocabulary) ? bindingRaw.vocabulary : {})) {
    if (!words.has(word))
      problems.push(`${bindingFile}: names the word "${word}", which ${conceptsFile} does not define`);
  }

  for (const file of [...(contract.create?.copy ?? []), ...(contract.create ? [contract.create.manifest] : [])]) {
    if (!exists(file)) problems.push(`${bindingFile} create: names ${file}, which does not exist`);
  }

  for (const checklist of contract.checklists) {
    const where = `checklist "${checklist.kind}"`;
    if (!checklist.place) problems.push(`${bindingFile} ${where}: "place" is missing`);
    if (!checklist.parts.length) problems.push(`${bindingFile} ${where}: lists no parts`);
    if (!checklist.concept) problems.push(`${contractFile} ${where}: names no concept`);
    else if (!conceptIds.has(checklist.concept)) {
      problems.push(
        `${contractFile} ${where}: names the concept ${checklist.concept}, which ${conceptsFile} does not define`,
      );
    }
  }
  const kinds = new Set(contract.checklists.map(checklist => checklist.kind));
  for (const kind of Object.keys(isObject(bindingRaw.checklists) ? bindingRaw.checklists : {})) {
    if (!kinds.has(kind))
      problems.push(`${bindingFile}: has a checklist for ${kind}, which ${contractFile} does not define`);
  }
  return problems;
}
