import { existsSync, readFileSync } from 'fs';
import { dirname, join, posix, resolve } from 'path';
import { load } from 'js-yaml';

import {
  ArchitectureContract,
  Checklist,
  Concept,
  ContractError,
  CreateSpec,
  Enforcement,
  FloorGuarantee,
  Language,
  Migration,
  MigrationApi,
  Rule,
  SUPPORTED_SCHEMA_VERSION,
  Mode,
  ModeName,
  Profile,
  ProfileBinding,
  ProfileMechanism,
  TestRow,
  Tree,
  Verb,
  VocabularyRow,
} from './types';
import { validateMigration } from './migration';
import { validateProfiles } from './profiles';

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

  const verbsOf = (section: unknown, boundVerbs: Raw): Verb[] =>
    ((section as { verbs?: Verb[] } | undefined)?.verbs ?? []).map(verb => {
      const example = text(boundVerbs[verb.intent]);
      return {
        intent: verb.intent,
        verb: verb.verb,
        shape: verb.shape,
        when: verb.when,
        ...(example && { example: local.path(example) }),
      };
    });
  const verbs: Verb[] = verbsOf(architecture.http, isObject(binding.verbs) ? binding.verbs : {});

  const kindsOf = (architecture.checklists as Record<string, { concept?: string }> | undefined) ?? {};
  const checklistsFrom = (bound: Raw, only: boolean): Checklist[] =>
    Object.entries(kindsOf)
      .filter(([kind]) => !only || isObject(bound[kind]))
      .map(([kind, entry]) => {
        const said = isObject(bound[kind]) ? (bound[kind] as Raw) : {};
        return {
          kind,
          concept: String(entry.concept ?? ''),
          place: said.place ? local.path(String(said.place)) : '',
          parts: strings(said.parts),
        };
      });
  const checklists: Checklist[] = checklistsFrom(isObject(binding.checklists) ? binding.checklists : {}, false);

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

  // The wires a migrated application may answer on, and this application's choice (ADR 36). YAML
  // reads a bare date as a Date; the binding means the day, as a string.
  const migrationApis = Object.fromEntries(
    Object.entries(
      isObject(architecture.migration) && isObject(architecture.migration.api) ? architecture.migration.api : {},
    ).map(([api, meaning]) => [api, String(meaning)]),
  );
  const migration: Migration | undefined = isObject(binding.migration)
    ? {
        api: String(binding.migration.api ?? 'native') as MigrationApi,
        routes: (Array.isArray(binding.migration.compatibility_routes) ? binding.migration.compatibility_routes : [])
          .filter(isObject)
          .map(route => ({
            method: String(route.method ?? '').toUpperCase(),
            path: String(route.path ?? ''),
            operation: String(route.operation ?? ''),
            file: route.file ? local.path(String(route.file)) : '',
            retires:
              route.retires instanceof Date ? route.retires.toISOString().slice(0, 10) : String(route.retires ?? ''),
          })),
      }
    : undefined;

  // The profiles (ADR 40): the floor and the profiles from the contract, the profile of each context
  // from the binding. A contract that declares none is held as written.
  const floor: FloorGuarantee[] = (Array.isArray(architecture.floor) ? architecture.floor : [])
    .filter(isObject)
    .map(entry => ({
      guarantee: String(entry.guarantee ?? ''),
      rules: strings(entry.rules),
      ...(text(entry.gap) && { gap: text(entry.gap) }),
      ...(text(entry.held_by) && { heldBy: text(entry.held_by) }),
    }));
  const listOrAll = (value: unknown): 'all' | string[] => (value === 'all' ? 'all' : strings(value));
  const textsOf = (value: unknown): Record<string, string> =>
    Object.fromEntries(Object.entries(isObject(value) ? value : {}).map(([id, said]) => [id, String(said ?? '')]));
  const profiles: Profile[] = Object.entries(isObject(architecture.profiles) ? architecture.profiles : {}).map(
    ([id, entry]) => {
      const raw = isObject(entry) ? entry : {};
      return {
        id,
        name: String(raw.name ?? id),
        why: String(raw.why ?? ''),
        default: raw.default === true,
        holds: listOrAll(raw.holds),
        waives: textsOf(raw.waives),
        conditional: textsOf(raw.conditional),
        gaps: strings(raw.gaps),
        grammar: String(raw.grammar ?? ''),
        checklists: listOrAll(raw.checklists),
        mechanisms: Object.fromEntries(
          Object.entries(isObject(raw.mechanisms) ? raw.mechanisms : {}).map(([mechanism, said]) => {
            const entry = isObject(said) ? said : {};
            const stance: ProfileMechanism['stance'] =
              'not_used' in entry ? 'not-used' : 'uses' in entry ? 'uses' : 'kept';
            const why = entry.not_used ?? entry.uses ?? entry.kept;
            return [
              mechanism,
              {
                stance,
                why: typeof why === 'string' ? why : '',
                ...(text(entry.until) && { until: text(entry.until) }),
              },
            ];
          }),
        ),
      };
    },
  );
  const contextProfiles = textsOf(binding.profiles);
  const grammars = Object.entries(architecture)
    .filter(([, value]) => isObject(value) && Array.isArray(value.verbs))
    .map(([key]) => key);
  // The verbs of every grammar a profile may answer on, beside the contract's own (`verbs`); a binding
  // that holds a profile names the routes that show its verbs under `profiles_held.<id>.verbs`.
  const held = isObject(binding.profiles_held) ? binding.profiles_held : {};
  const grammarVerbs: Record<string, Verb[]> = Object.fromEntries(
    grammars
      .filter(grammar => grammar !== 'http')
      .map(grammar => {
        const holding = profiles
          .filter(profile => profile.grammar === grammar)
          .map(profile => held[profile.id])
          .find(entry => isObject(entry) && isObject(entry.verbs)) as Raw | undefined;
        return [grammar, verbsOf(architecture[grammar], isObject(holding?.verbs) ? holding.verbs : {})];
      }),
  );
  // How the binding holds each profile other than the default (ADR 40): its checklists where they
  // differ, the files that show its mechanisms, what `create --profile` copies in place of `create`.
  const profilesHeld: Record<string, ProfileBinding> = Object.fromEntries(
    Object.entries(held).map(([id, entry]) => {
      const raw = isObject(entry) ? entry : {};
      const shows = Object.fromEntries(
        Object.entries(isObject(raw.shows) ? raw.shows : {}).map(([mechanism, files]) => [
          mechanism,
          local.paths(Array.isArray(files) ? files : [files]),
        ]),
      );
      return [
        id,
        {
          checklists: checklistsFrom(isObject(raw.checklists) ? raw.checklists : {}, true),
          shows,
          ...(isObject(raw.create) && { create: createSpecOf(raw.create, local.path, true) }),
        },
      ];
    }),
  );
  const bindingProfile = text(binding.default_profile);

  const boundVocabulary = isObject(binding.vocabulary) ? binding.vocabulary : {};
  const vocabulary: VocabularyRow[] = (
    (concepts.vocabulary as { word: string; meaning: string }[] | undefined) ?? []
  ).map(row => ({ word: row.word, meaning: row.meaning, see: local.markdown(text(boundVocabulary[row.word])) ?? '' }));

  const tests: TestRow[] = ((binding.tests as TestRow[] | undefined) ?? []).map(row => ({
    layer: row.layer,
    example: local.markdown(row.example) ?? '',
    doubles: local.markdown(row.doubles) ?? '',
  }));

  const create = isObject(binding.create) ? (createSpecOf(binding.create, local.path, false) as CreateSpec) : undefined;

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
    fixes: strings(binding.fixes),
    ...(isObject(binding.relationship_tests) && {
      relationshipTests: {
        suffix: String(binding.relationship_tests.suffix ?? '.spec.ts'),
        ...(binding.relationship_tests.run !== undefined && { run: String(binding.relationship_tests.run) }),
      },
    }),
    ...(create && { create }),
    layers: Object.keys(layersRaw),
    rules,
    concepts: conceptList,
    verbs,
    checklists,
    modes,
    migrationApis,
    ...(migration && { migration }),
    floor,
    profiles,
    contextProfiles,
    grammars,
    grammarVerbs,
    ...(bindingProfile && { bindingProfile }),
    profilesHeld,
    tests,
    vocabulary,
    sources,
  };
}

/**
 * A binding's `create` section, its paths made repository-relative. `partial`: only the keys it names
 * (a profile's `create`, which stands in for the binding's own where it says something).
 */
function createSpecOf(raw: Raw, path: (value: string) => string, partial: boolean): Partial<CreateSpec> {
  const spec: Partial<CreateSpec> = {
    copy: (Array.isArray(raw.copy) ? raw.copy : []).map((entry: unknown) =>
      isObject(entry)
        ? { from: path(String(entry.from ?? '')), to: path(String(entry.to ?? '')) }
        : { from: path(String(entry)), to: path(String(entry)) },
    ),
    contracts: path(String(raw.contracts ?? '')),
    manifest: path(String(raw.manifest ?? '')),
    members: strings(raw.members),
    dependencies: strings(raw.dependencies),
    devDependencies: strings(raw.devDependencies),
    scripts: strings(raw.scripts),
    inventory: raw.inventory === true,
    install: String(raw.install ?? ''),
    test: String(raw.test ?? ''),
  };
  if (!partial) return spec;
  const said = new Set(Object.keys(raw));
  return Object.fromEntries(Object.entries(spec).filter(([key]) => said.has(key))) as Partial<CreateSpec>;
}

/** Everything a loaded contract can still get wrong, one line each; empty means the contract is sound. */
export function validateContract(
  contract: ArchitectureContract,
  root: string = repositoryRoot(),
  /** The day a compatibility route's retirement is held against, `YYYY-MM-DD`; today unless a test says otherwise. */
  today?: string,
): string[] {
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

  for (const file of [
    ...(contract.create?.copy ?? []).map(entry => entry.from),
    ...(contract.create ? [contract.create.manifest] : []),
  ]) {
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

  // How the binding holds a profile other than the default (ADR 40): the files it names exist, and its
  // checklists are kinds the contract has.
  const heldRaw = isObject(bindingRaw.profiles_held) ? bindingRaw.profiles_held : {};
  for (const [id, holding] of Object.entries(contract.profilesHeld)) {
    const raw = isObject(heldRaw[id]) ? (heldRaw[id] as Raw) : {};
    for (const kind of Object.keys(isObject(raw.checklists) ? raw.checklists : {})) {
      if (!kinds.has(kind))
        problems.push(
          `${bindingFile} profiles_held.${id}: has a checklist for ${kind}, which ${contractFile} does not define`,
        );
    }
    for (const [mechanism, files] of Object.entries(holding.shows)) {
      for (const file of files) {
        if (!exists(file))
          problems.push(`${bindingFile} profiles_held.${id}: "${mechanism}" names ${file}, which does not exist`);
      }
    }
    for (const entry of holding.create?.copy ?? []) {
      if (!exists(entry.from))
        problems.push(`${bindingFile} profiles_held.${id} create: names ${entry.from}, which does not exist`);
    }
    const grammar = contract.profiles.find(profile => profile.id === id)?.grammar ?? '';
    for (const verb of contract.grammarVerbs[grammar] ?? []) {
      if (verb.example && !exists(verb.example))
        problems.push(
          `${bindingFile} profiles_held.${id} verb "${verb.intent}": names ${verb.example}, which does not exist`,
        );
    }
    const intents = new Set((contract.grammarVerbs[grammar] ?? []).map(verb => verb.intent));
    for (const intent of Object.keys(isObject(raw.verbs) ? raw.verbs : {})) {
      if (!intents.has(intent))
        problems.push(
          `${bindingFile} profiles_held.${id}: names the verb ${intent}, which the grammar ${grammar} does not define`,
        );
    }
  }

  // A migrated application's wire, and the compatibility routes it declares (ADR 36).
  problems.push(...validateMigration(contract, root, today));
  // The profiles the contract declares, and the profile the binding names for each context (ADR 40).
  problems.push(...validateProfiles(contract, root));
  return problems;
}
