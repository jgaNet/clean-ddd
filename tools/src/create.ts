import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { dump, load } from 'js-yaml';

import { ArchitectureContract, Concept, ContractError, CreateSpec, Rule } from './types';
import { loadArchitectureContract, repositoryRoot, typedFrom } from './load';
import { serializeInventory } from './inventory';
import {
  END_MARKER,
  RULES_MARKER,
  SECTION_MARKER,
  renderConceptLayer,
  renderRulesList,
  renderRulesTable,
  shown,
} from './render';

/**
 * `yarn architecture create <dir>`: a new application with this repository's architecture and
 * none of its business.
 *
 * The rule that keeps it honest: **it copies what exists and generates the rest from the
 * contract; it templates nothing.** A scaffolder that carried its own copy of the building
 * blocks, or its own wording of the rules, would drift from the reference within a month. So
 * the building blocks, the shared kernel and the configuration are copied verbatim from the
 * reference — the checkout this runs in, or the copy of it the published package carries, made
 * at build time from the same files — and the new README, CLAUDE.md and conventions are
 * rendered from the same contract that renders this repository's own. The tooling is not
 * copied: the new application depends on this package (`clean-ddd`), which is why the
 * generated project passes the same six checks on its first run and keeps up with the tool.
 *
 * What it does *not* give you is an application: there are no contexts, no composition root
 * and no routes, because those are the business, and copying someone else's business is how a
 * reference implementation becomes a framework. The generated CLAUDE.md says what to write
 * first and `yarn architecture checklist context` says what it is made of.
 *
 * The new application is a repository of one language: its contract, its binding and its code
 * sit in the same directory, which is the shape this tooling takes when the binding's `root`
 * is `.`.
 */

/** Copied as they are, from the repository root, which every language shares. */
const COPY_FROM_ROOT = [
  // The loop, for whoever works here with an agent: the skill asks the contract for the shape
  // before writing, the agent definition is bound to the feature mode. Both name commands
  // rather than files, so they are as true in a new project as they are here.
  '.claude',
  '.editorconfig',
];

/** The tooling, as the scripts every guide names; the package answers them all. */
const TOOL_SCRIPTS = {
  'check:conventions': 'clean-ddd check',
  'conventions:write': 'clean-ddd check --write',
  architecture: 'clean-ddd',
};

/**
 * Where the reference is read from: the checkout the command was typed in, when it is one (a
 * repository whose binding's root is a directory of its own), else the copy the published
 * package carries beside this file, made at build time from the same files.
 */
export function referenceSource(from: string = typedFrom()): string {
  try {
    const checkout = repositoryRoot(from);
    if (loadArchitectureContract(checkout).language.root !== '.') return checkout;
  } catch {
    // not typed inside a repository that holds the contract: the bundled reference, below
  }
  const bundled = resolve(dirname(fileURLToPath(import.meta.url)), 'reference');
  if (existsSync(join(bundled, 'conventions/architecture.yaml'))) return bundled;
  throw new Error('no reference to copy from: run this from a checkout of clean-ddd, or from the published package');
}

const exists = (root: string, path: string) => existsSync(join(root, path));

/**
 * A path as the new application knows it. The reference's contract speaks repository-relative
 * paths (`typescript/src/…`); the new application is a repository of one language, where the
 * same file is at `src/…`. What was never under the language's directory (a decision, the
 * conventions) keeps its path.
 */
const inApplication =
  (contract: ArchitectureContract) =>
  (path: string): string => {
    const prefix = `${contract.language.root}/`;
    return contract.language.root !== '.' && path.startsWith(prefix) ? path.slice(prefix.length) : path;
  };

/**
 * The prose keeps its words and loses its dead links: a Markdown link to a file this
 * application does not have becomes the label alone, so the sentence still reads and the
 * link check still passes.
 */
const delinkify = (text: string, target: string): string =>
  text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (whole, label, path) =>
    exists(target, String(path).split('#')[0]) ? whole : String(label),
  );

/** Only what the new project actually has: a rule's reference to a file nobody copied is dropped. */
const leanRule = (rule: Rule, target: string, local: (path: string) => string): Rule => ({
  ...rule,
  references: rule.references.map(local).filter(reference => exists(target, reference)),
  examples: rule.examples.map(local).filter(example => exists(target, example)),
  statement: delinkify(rule.statement, target),
  why: delinkify(rule.why, target),
  remediation: delinkify(rule.remediation, target),
});

/**
 * The same URL shape with this repository's nouns replaced by placeholders: `GET /notes/:id`
 * becomes `GET /<things>/:id`, `POST /notes/:id/share` becomes `POST /<things>/:id/<action>`.
 *
 * What the table teaches is the grammar — which verb a use case takes, and what the URL names
 * — and the grammar survives the substitution. A made-up noun would not be a placeholder but
 * a small fictional domain, which is the templating ADR 10 refuses; `<things>` is the same
 * idiom the checklists already use for `src/Contexts/<Context>/...`.
 */
function neutralShape(shape: string, intent: string): string {
  const trailing: Record<string, string> = { act: '<action>', 'create-under': '<items>' };
  const [verb, path = ''] = shape.split(' ');
  const [route, query] = path.split('?');
  let collection = false;
  const segments = route
    .split('/')
    .filter(Boolean)
    .map(segment => {
      if (segment.startsWith(':')) return segment;
      if (collection) return trailing[intent] ?? '<part>';
      collection = true;
      return '<things>';
    });
  return `${verb} /${segments.join('/')}${query ? `?${query}` : ''}`;
}

/** Walks a parsed table and drops every reference that points at a file nobody copied. */
function prune(node: unknown, target: string): void {
  if (Array.isArray(node)) return node.forEach(child => prune(child, target));
  if (typeof node !== 'object' || node === null) return;
  const record = node as Record<string, unknown>;
  if (Array.isArray(record.references)) {
    record.references = (record.references as string[]).filter(reference => exists(target, reference));
  }
  for (const value of Object.values(record)) prune(value, target);
}

/**
 * A concept survives in the binding if at least one file that shows it was copied —
 * `aggregate-root` keeps `AggregateRoot.ts` and loses `Note.ts`, which is the reference's
 * business. Its lists are narrowed to what is really there; the README cell is rebuilt from
 * what survived, and the language's note, which pointed at this repository's files, goes.
 */
const surviving = (concept: Concept, target: string, local: (path: string) => string): Concept | undefined => {
  const canonical = concept.canonical.map(local).filter(file => exists(target, file));
  if (!canonical.length) return undefined;
  return {
    ...concept,
    canonical,
    examples: concept.examples.map(local).filter(file => exists(target, file)),
    example: undefined,
    notes: undefined,
    description: delinkify(concept.description, target),
    references: concept.references.map(local).filter(reference => exists(target, reference)),
  };
};

export interface CreatedApplication {
  directory: string;
  name: string;
  language: string;
  /** The commands to run first, in the language's words. */
  next: string[];
  files: number;
  /** The concepts the new application's binding shows a file for. */
  concepts: number;
  rules: number;
}

export function createApplication(
  directory: string,
  name: string,
  source: string = referenceSource(),
  language?: string,
): CreatedApplication {
  if (existsSync(directory) && readdirSync(directory).length) {
    throw new Error(`${directory} is not empty; a new application is created in an empty directory`);
  }
  const contract = loadArchitectureContract(source, language);
  const spec = contract.create;
  if (!spec) {
    throw new ContractError(
      `${contract.sources.binding} says nothing about create yet: a \`create\` section names what to copy and what to write for ${contract.language.name}`,
      'malformed',
    );
  }
  const local = inApplication(contract);
  const languageDir = join(source, contract.language.root);

  // 1. Copy the architecture, the shared kernel and the configuration, as the binding lists
  //    them. The building blocks come with their specs — they are the best description of what
  //    a Result, an aggregate or a publish-after-commit does. The tooling that reads the
  //    contract is not copied: the new application depends on this package, and what it does
  //    for it is proved by `check`, which runs against its own contract. A language whose
  //    linter is its own tool (Python) lists that tool here: it travels with the tree it holds.
  const copy = (from: string, path: string) => {
    const to = join(directory, path);
    mkdirSync(dirname(to), { recursive: true });
    cpSync(join(from, path), to, { recursive: true });
  };
  for (const path of spec.copy) copy(languageDir, local(path));
  for (const path of COPY_FROM_ROOT) copy(source, path);
  // A Go module: the reference's module path becomes the application's name, in every import.
  const modulePath = moduleOf(source, contract);
  if (modulePath && modulePath !== name) rewriteModulePath(directory, modulePath, name);

  // 2. The places a new application fills in: where its contexts will publish, where they will live.
  const contractsDir = local(spec.contracts);
  const contextsDir = local(contract.contextsTree.path);
  mkdirSync(join(directory, contractsDir), { recursive: true });
  // A module file copied with the folder (Rust's mod.rs) keeps its doc comment and loses the
  // declarations of this repository's contracts: the application has none yet.
  const moduleFile = join(directory, contractsDir, 'mod.rs');
  if (existsSync(moduleFile)) {
    const kept = readFileSync(moduleFile, 'utf8')
      .split('\n')
      .filter(line => line.trim() === '' || line.trim().startsWith('//'));
    writeFileSync(moduleFile, `${kept.join('\n').trim()}\n`);
  }
  writeFileSync(
    join(directory, contractsDir, 'README.md'),
    [
      '# Integration events',
      '',
      'The published contracts between this application’s contexts: named, versionable payloads,',
      'one file per subject. Both sides see the same file, so changing one is a visible, reviewable',
      'change to a contract.',
      '',
      'Nothing here yet: a contract appears when a first consumer needs a fact.',
      '`clean-ddd checklist integration-event` says what one is made of.',
      '',
    ].join('\n'),
  );
  mkdirSync(join(directory, contextsDir), { recursive: true });
  writeFileSync(
    join(directory, contextsDir, 'README.md'),
    [
      '# Contexts',
      '',
      `One folder per bounded context, each with the four layers (${contract.layers.map(layer => `\`${layer}\``).join(', ')})`,
      `and its wiring file \`${contract.wiring}\`, and each declared in \`conventions/${contract.language.id}.yaml\``,
      'so that the import rules apply to it.',
      '',
      'Nothing here yet. `clean-ddd checklist context` says what a context is made of, and',
      '`clean-ddd checklist aggregate` what goes in its Domain.',
      '',
    ].join('\n'),
  );

  // 3. The contract, kept whole, and the binding emptied of this repository's business.
  const rules: Rule[] = contract.rules.map(rule => leanRule(rule, directory, local));
  const concepts = contract.concepts
    .map(concept => surviving(concept, directory, local))
    .filter((concept): concept is Concept => concept !== undefined);
  writeContract(directory, source, contract, concepts, name);

  // 4. The documents, rendered from that contract exactly as this repository renders its own,
  //    the manifest, and — where the language's own tool holds its inventory — an empty one.
  const lean: ArchitectureContract = {
    ...contract,
    rules,
    concepts,
    contexts: [],
    language: { ...contract.language, root: '.' },
  };
  writeFileSync(join(directory, 'README.md'), readme(lean, name, local));
  writeFileSync(join(directory, 'CLAUDE.md'), claude(lean, name, local));
  mkdirSync(join(directory, 'docs/adr'), { recursive: true });
  writeFileSync(join(directory, 'docs/adr/README.md'), adrIndex());
  // The two contracts that keep contexts apart once there are several, present from the first day
  // (RFC 0001): an empty context map, so that CTX-MAP-DECLARED holds the first relationship between
  // two contexts, and the directory the storms a session decides are written to.
  writeFileSync(join(directory, 'conventions/domain.yaml'), domainMapSkeleton(name));
  mkdirSync(join(directory, 'conventions/storms'), { recursive: true });
  writeFileSync(join(directory, 'conventions/storms/README.md'), stormsReadme());
  writeFileSync(join(directory, local(spec.manifest)), manifest(spec, source, languageDir, name));
  if (!existsSync(join(directory, '.gitignore'))) {
    writeFileSync(join(directory, '.gitignore'), 'node_modules\ndist\ncoverage\n*.tsbuildinfo\n');
  }
  if (spec.inventory) {
    mkdirSync(join(directory, 'docs/inventory'), { recursive: true });
    writeFileSync(
      join(directory, `docs/inventory/${contract.language.id}.json`),
      serializeInventory({ schemaVersion: 1, language: contract.language.id, contexts: [], links: [] }),
    );
  }

  return {
    directory,
    name,
    language: contract.language.id,
    next: [
      `cd ${directory} && ${spec.install}`,
      `${toolCheck(contract)} && ${spec.test}`,
      `${tool(contract)} checklist context`,
    ],
    files: count(directory),
    concepts: concepts.length,
    rules: rules.length,
  };
}

function count(directory: string): number {
  return readdirSync(directory, { withFileTypes: true, recursive: true }).filter(entry => entry.isFile()).length;
}

/** The module path a binding declares (`module: clean-ddd` in Go), or nothing. */
function moduleOf(source: string, contract: ArchitectureContract): string | undefined {
  const raw = load(readFileSync(join(source, contract.sources.binding), 'utf8')) as { module?: unknown };
  return typeof raw.module === 'string' ? raw.module : undefined;
}

/** The same contract and the same binding, with no contexts of their own yet and no reference to a file that was not copied. */
function writeContract(
  directory: string,
  source: string,
  contract: ArchitectureContract,
  concepts: Concept[],
  name: string,
): void {
  mkdirSync(join(directory, 'conventions/plans'), { recursive: true });
  const yaml = { lineWidth: 110, noRefs: true };
  // The header comment — the vocabulary a file is read with — is carried over, naming the tool as the new application calls it.
  const headerOf = (text: string) =>
    text
      .slice(0, text.indexOf('schemaVersion:'))
      .replace(/`yarn check:conventions`/g, '`clean-ddd check`')
      .replace(/`yarn architecture /g, '`clean-ddd ')
      .replace(/ \(the tooling at the root\)/g, '');

  // The contract, as data: the same table, with every reference that points at a file this
  // application does not have removed. The header comment — the vocabulary the table is read
  // with — is carried over; the rest is rewritten from the parsed document.
  const contractText = readFileSync(join(source, contract.sources.architecture), 'utf8');
  const table = load(contractText) as Record<string, unknown>;
  table.languages = [contract.language.id];
  prune(table, directory);
  // The verb table keeps its grammar and loses this repository's nouns.
  for (const verb of (table.http as { verbs?: { intent: string; shape: string }[] })?.verbs ?? []) {
    verb.shape = neutralShape(verb.shape, verb.intent);
  }
  const note = [
    '# Created by `clean-ddd create` from the clean-ddd reference. The URL shapes in',
    '# `http.verbs` are written with placeholders (`GET /<things>/:id`), because what that table',
    '# teaches is the grammar — which verb a use case takes, and what the URL names. Fill them in',
    '# with your own nouns as your first routes appear.',
    '',
    '',
  ].join('\n');
  writeFileSync(join(directory, contract.sources.architecture), `${headerOf(contractText)}${note}${dump(table, yaml)}`);

  // The concepts: every one of them, in the contract's words, with the decisions it cannot
  // link to any more turned back into plain text. Which ones this application shows is the
  // binding's business.
  const conceptsText = readFileSync(join(source, contract.sources.concepts), 'utf8');
  const vocabulary = load(conceptsText) as { vocabulary?: unknown };
  writeFileSync(
    join(directory, contract.sources.concepts),
    `${headerOf(conceptsText)}${dump(
      {
        schemaVersion: 1,
        concepts: contract.concepts.map(({ id, name, layer, description, rules }) => ({
          id,
          name,
          layer,
          description: delinkify(description, directory),
          rules,
        })),
        vocabulary: vocabulary.vocabulary ?? [],
      },
      yaml,
    )}`,
  );

  // The binding: this application is a repository of one language, so its root is `.`; its
  // contexts are its own to declare; and it points only at files it has. The checklists and
  // the enforcers are kept whole: they are the language's idiom, not the reference's business.
  const bindingText = readFileSync(join(source, contract.sources.binding), 'utf8');
  const binding = load(bindingText) as Record<string, unknown>;
  binding.root = '.';
  binding.contexts = [];
  if (typeof binding.module === 'string' && binding.module !== name) {
    const from = binding.module;
    binding.module = name;
    for (const tree of ['contexts_tree', 'architecture', 'kernel', 'bootstrap']) {
      const entry = binding[tree] as { alias?: string } | undefined;
      if (entry?.alias?.startsWith(`${from}/`)) entry.alias = `${name}${entry.alias.slice(from.length)}`;
      else if (entry?.alias === from) entry.alias = name;
    }
  }
  prune(binding, directory);
  const bindingRules = (binding.rules ?? {}) as Record<string, { references?: string[] }>;
  for (const [id, entry] of Object.entries(bindingRules)) if (!entry.references?.length) delete bindingRules[id];
  const bindingVerbs = (binding.verbs ?? {}) as Record<string, string>;
  for (const [intent, file] of Object.entries(bindingVerbs)) if (!exists(directory, file)) delete bindingVerbs[intent];
  binding.concepts = Object.fromEntries(
    concepts.map(concept => [
      concept.id,
      { canonical: concept.canonical, ...(concept.examples.length && { examples: concept.examples }) },
    ]),
  );
  binding.tests = [];
  binding.vocabulary = {};
  const bindingNote = [
    '# Created by `clean-ddd create` from the clean-ddd reference. `contexts` is empty:',
    '# declare your first one there, or no import rule applies to its files. A concept whose',
    '# canonical file this application does not have yet is not listed under `concepts`; add it',
    '# back with the file when you write it.',
    '',
    '',
  ].join('\n');
  writeFileSync(
    join(directory, contract.sources.binding),
    `${headerOf(bindingText)}${bindingNote}${dump(binding, yaml)}`,
  );

  writeFileSync(
    join(directory, 'conventions/README.md'),
    [
      '# Conventions',
      '',
      'The architecture of this application, as data, so that tooling can hold the code to it.',
      '',
      '| File | What it holds |',
      '|---|---|',
      '| [`architecture.yaml`](architecture.yaml) | the layers, which layer may import from which, the rules, the HTTP verbs, the kinds of thing a feature is made of, and the two modes |',
      `| [\`${contract.language.id}.yaml\`](${contract.language.id}.yaml) | this language's binding: the contexts, the trees and their aliases, the libraries, the file that shows each concept, what a new thing of each kind is made of |`,
      '| [`concepts.yaml`](concepts.yaml) | every concept, in the contract’s words |',
      '| [`plans/`](plans) | feature plans: what a change intends, checked before it is written |',
      '',
      '```bash',
      'clean-ddd check           # the contract is sound and the documents are rendered from it',
      'clean-ddd check --write   # regenerate the rendered blocks in README.md and CLAUDE.md',
      'clean-ddd …               # ask the contract: inspect, rules, concepts, verbs, checklists, plan, mode, can-import',
      '```',
      '',
      `Adding a context means adding it to \`contexts\` in \`${contract.language.id}.yaml\`, or no import rule applies to it.`,
      '',
    ].join('\n'),
  );
  writeFileSync(
    join(directory, 'conventions/plans/README.md'),
    [
      '# Feature plans',
      '',
      'A plan is what a change intends, written before the code: `clean-ddd plan validate <file>`',
      'checks it against the contract and the tree, `plan explain <file>` expands it into the files, the',
      'rules and the examples it implies.',
      '',
      'Every plan here is validated by `clean-ddd check`, so none of them can rot.',
      '',
    ].join('\n'),
  );
}

const generated = (marker: string, body: string) => `${marker}\n${body}\n${END_MARKER}`;

/** The tool's commands as the generated guides name them: in a TypeScript application through its scripts, elsewhere through npx. */
const tool = (contract: ArchitectureContract): string =>
  contract.create?.manifest.endsWith('package.json') ? 'yarn architecture' : 'npx clean-ddd';
const toolCheck = (contract: ArchitectureContract): string =>
  contract.create?.manifest.endsWith('package.json') ? 'yarn check:conventions' : 'npx clean-ddd check';

/** `local` turns the reference's repository-relative paths into the application's own (`python/src/…` → `src/…`). */
function readme(contract: ArchitectureContract, name: string, local: (path: string) => string): string {
  const spec = contract.create as CreateSpec;
  const layers = (['domain', 'application', 'infrastructure', 'presentation'] as const).filter(layer =>
    contract.concepts.some(concept => concept.layer === layer && shown(concept)),
  );
  const pad = (path: string) => `${path}/`.padEnd(22);
  const ask = tool(contract);
  // The commands of the first steps, aligned on the longest.
  const commands = [
    spec.install,
    toolCheck(contract),
    ...contract.checks,
    `${ask} inspect`,
    `${ask} checklist context`,
  ];
  const width = Math.max(...commands.map(command => command.length)) + 3;
  return [
    `# ${name}`,
    '',
    `An application built on the Clean Architecture and Domain-Driven Design reference implementation`,
    `[clean-ddd](https://github.com/jgaNet/clean-ddd), in ${contract.language.name}: its building blocks, its shared kernel, its`,
    'architecture contract and its checks, with none of its business.',
    '',
    '## What is here',
    '',
    '```',
    `${pad(local(contract.architecture.path))}the building blocks: Entity, AggregateRoot, ValueObject, Result, the handlers,`,
    '                      the execution context, the event bus, the in-memory adapters. Mechanics, no vocabulary.',
    `${pad(local(contract.kernel.path))}what every context will agree on: the shared kernel's model (an email, a role, the`,
    `                      signed-in guard) and, under ${local(spec.contracts)}/, the integration events your contexts will publish.`,
    `${pad(local(contract.contextsTree.path))}your bounded contexts. Empty: this is the part that is yours.`,
    'conventions/          the architecture as data; the import rules are generated from it.',
    `                      The tooling that holds the code to it is the clean-ddd package (${ask} …, ${toolCheck(contract)}).`,
    '```',
    '',
    '## First steps',
    '',
    '```bash',
    `${spec.install.padEnd(width)}# the language's toolchain`,
    `${toolCheck(contract).padEnd(width)}# the contract is sound, the documents are rendered from it`,
    ...contract.checks.map(
      (check, index) =>
        `${check.padEnd(width)}# ${index === 0 ? "the tree and the imports, by the language's own tool" : 'as CI runs it'}`,
    ),
    `${`${ask} inspect`.padEnd(width)}# what the contract holds`,
    `${`${ask} checklist context`.padEnd(width)}# what your first context is made of`,
    '```',
    '',
    `Then: name your first context in \`conventions/${contract.language.id}.yaml\`, create it under \`${local(contract.contextsTree.path)}\`,`,
    `and write your composition root in \`${local(contract.bootstrap.path)}\`. \`${ask} checklist aggregate\` says`,
    `what goes in its Domain, and \`${ask} can-import <file> <specifier>\` or the language's own \`can-import\` answers,`,
    'before you write an import, whether the rules allow it.',
    '',
    '## The rules, and how they are enforced',
    '',
    `Every rule has a stable id; \`${ask} rule <ID>\` explains it, \`--json\` for a tool.`,
    '',
    generated(RULES_MARKER('rules'), renderRulesTable(contract)),
    '',
    '## The map: concept → file',
    '',
    `One canonical example per concept, rendered from \`conventions/concepts.yaml\` and \`conventions/${contract.language.id}.yaml\`.`,
    '',
    ...layers.flatMap(layer => [
      `### ${layer[0].toUpperCase()}${layer.slice(1)} layer`,
      '',
      generated(SECTION_MARKER(layer), renderConceptLayer(contract, layer)),
      '',
    ]),
    '## Decisions',
    '',
    'Why the architecture is the way it is, in the reference: [docs/adr](https://github.com/jgaNet/clean-ddd/tree/main/docs/adr).',
    'Your own decisions go in [`docs/adr`](docs/adr/README.md), numbered from 1.',
    '',
  ].join('\n');
}

function claude(contract: ArchitectureContract, name: string, local: (path: string) => string): string {
  const ask = tool(contract);
  const width = Math.max(...[toolCheck(contract), ...contract.checks].map(command => command.length)) + 3;
  return [
    `# Working on ${name} (guide for AI assistance)`,
    '',
    `This application is built on the [clean-ddd](https://github.com/jgaNet/clean-ddd) architecture, in ${contract.language.name}:`,
    'the rules below are generated from [`conventions/architecture.yaml`](conventions/architecture.yaml),',
    `and that file with [\`conventions/${contract.language.id}.yaml\`](conventions/${contract.language.id}.yaml) generates the import rules the linter enforces (${contract.enforcers.linter}). Ask the contract before guessing.`,
    '',
    '## Commands',
    '',
    '```bash',
    `${toolCheck(contract).padEnd(width)}# the contract is sound, the documents are rendered from it`,
    ...contract.checks.map(check => `${check.padEnd(width)}# the language's own check, as CI runs it`),
    `${ask} inspect | rules | concepts | verbs | checklists`,
    `${ask} rule <ID> | concept <id> | verb <intent> | checklist <kind> | place <kind>`,
    `${ask} plan validate|explain <file>        # a change, stated before it is written`,
    `${ask} mode feature|architecture           # which rules this change is held to`,
    '```',
    '',
    '## The rules (enforced)',
    '',
    generated(RULES_MARKER('rules'), renderRulesList(contract)),
    '',
    '## How to add a feature',
    '',
    `Run \`${ask} checklist <kind>\` for the file list, and \`${ask} verb <intent>\``,
    'for the route. In short: the domain first (a behaviour on the aggregate that enforces the rule and',
    'records an event), then the command or query handler, then the adapter only if a port changed, then',
    `the route, then the wiring in \`${contract.wiring}\`. A rule that spans aggregates or needs a port is a`,
    'domain service. Expected failures are `Result` values, never thrown.',
    '',
    '## Things to avoid',
    '',
    '- A generic `Mapper`, `Repository<T>`, `Saga`, service locator or DI container.',
    `- Fixing a boundary violation by silencing the linter instead of a port: the conventions check refuses one.`,
    `- Changing anything under \`${local(contract.architecture.path)}\`, \`${local(contract.kernel.path)}\` or \`conventions\` while adding a feature:`,
    `  \`${ask} mode feature\` will say so, and that is a finding, not a detour.`,
    '',
  ].join('\n');
}

const domainMapSkeleton = (name: string) =>
  [
    '# The domain, as data: the subdomains and their kind, each bounded context with its purpose and its',
    '# language, and the context map — every relationship between two contexts, the pattern it follows,',
    '# the mechanism that carries it and why. The conventions check holds it to the binding (a context',
    '# declared there is described here) and to the code (a link between two contexts that this map does',
    '# not declare is refused, and so is a relationship nothing carries: CTX-MAP-DECLARED). It starts',
    '# empty: the first context is described here when it is declared in the binding.',
    '# `clean-ddd rule CTX-MAP-DECLARED` explains the rule; `clean-ddd concept context-map` the idea.',
    'schemaVersion: 1',
    `name: ${name}`,
    'purpose: >-',
    `  What ${name} is for, in the words of the people who use it. Rewrite this sentence before the first context.`,
    'subdomains: []',
    'contexts: []',
    'relationships: []',
    '',
  ].join('\n');

const stormsReadme = () =>
  [
    '# Storms',
    '',
    'An expected storm is what an event-storming session decided a feature adds, written in the words the',
    'inventory uses — commands, queries, domain events, policies, the links between contexts — before the',
    'code. The conventions check holds every storm here to the code: done and carried, or not yet.',
    '',
    'The [`storm` skill](../../.claude/skills/storm/SKILL.md) facilitates the session and writes the file;',
    '`clean-ddd storm validate <file>` holds it to the contract and the context map, and',
    '`clean-ddd storm --expect <file>` says what the code still owes it.',
    '',
  ].join('\n');

const adrIndex = () =>
  [
    '# Architecture decision records',
    '',
    'Short notes on the choices a newcomer is most likely to question. Each one says what was decided,',
    'why, what it costs, and when to revisit it.',
    '',
    '| # | Decision |',
    '|---|---|',
    '',
    'None yet. The decisions behind the building blocks themselves are recorded in the reference:',
    'https://github.com/jgaNet/clean-ddd/tree/main/docs/adr — copy the shape of one, number it, and link',
    'it from this table and from wherever the rule is stated.',
    '',
  ].join('\n');

/**
 * The manifest, in the language's idiom: a `package.json` is rebuilt from the reference's with
 * the scripts and the dependencies the binding keeps, plus this package; a `pyproject.toml` is
 * the reference's text with its name, its version and its dependency list rewritten. The
 * format of each is this repository's own, so a textual rewrite is read against a known file.
 */
function manifest(spec: CreateSpec, source: string, languageDir: string, name: string): string {
  const file = spec.manifest.split('/').pop() ?? spec.manifest;
  const text = readFileSync(join(languageDir, file), 'utf8');
  if (file === 'package.json') return packageJson(spec, source, text, name);
  if (file === 'pyproject.toml') return pyproject(spec, text, name);
  if (file === 'go.mod') return goMod(spec, text, name);
  if (file === 'Cargo.toml') return cargoToml(spec, text, name);
  throw new ContractError(
    `create cannot write a ${file} yet; a manifest is package.json, pyproject.toml, go.mod or Cargo.toml`,
    'malformed',
  );
}

function packageJson(spec: CreateSpec, source: string, text: string, name: string): string {
  const reference = JSON.parse(text) as {
    scripts: Record<string, string>;
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
    engines: unknown;
  };
  // The tool itself, at the version that made this application: the root package of the reference.
  const tool = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8')) as { name: string; version: string };
  const pick = (from: Record<string, string>, keys: string[]) =>
    Object.fromEntries(keys.filter(key => from[key]).map(key => [key, from[key]]));

  return `${JSON.stringify(
    {
      name,
      version: '0.1.0',
      private: true,
      type: 'module',
      engines: reference.engines,
      scripts: { ...pick(reference.scripts, spec.scripts), ...TOOL_SCRIPTS },
      dependencies: pick(reference.dependencies, spec.dependencies),
      devDependencies: { ...pick(reference.devDependencies, spec.devDependencies), [tool.name]: `^${tool.version}` },
    },
    null,
    2,
  )}\n`;
}

/**
 * The reference's go.mod with the application's name as its module path and its requirements
 * narrowed to what the copied files import; `go mod tidy` settles the rest, go.sum included.
 */
function goMod(spec: CreateSpec, text: string, name: string): string {
  const lines = text.split('\n');
  const kept: string[] = [];
  let inRequire = false;
  let block: string[] = [];
  for (const line of lines) {
    if (/^module\s/.test(line)) {
      kept.push(`module ${name}`);
    } else if (/^require\s*\($/.test(line)) {
      inRequire = true;
      block = [];
    } else if (inRequire && line.trim() === ')') {
      inRequire = false;
      if (block.length) kept.push('require (', ...block, ')');
    } else if (inRequire) {
      if (spec.dependencies.some(dependency => line.trim().startsWith(`${dependency} `))) block.push(line);
    } else if (/^require\s/.test(line)) {
      if (spec.dependencies.some(dependency => line.includes(`${dependency} `))) kept.push(line);
    } else {
      kept.push(line);
    }
  }
  return `${kept
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()}\n`;
}

/**
 * A Go import is the module path: the copied files import `clean-ddd/architecture/domain`, and
 * the application's module is its name, so every import under the reference's module path, and
 * every alias of the binding, is rewritten with it. Done on the files once copied, which keeps
 * `create` a copy and a rename rather than a template (ADR 10).
 */
function rewriteModulePath(directory: string, from: string, to: string): void {
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
      entry.isDirectory() ? walk(join(dir, entry.name)) : entry.name.endsWith('.go') ? [join(dir, entry.name)] : [],
    );
  for (const path of walk(directory)) {
    const text = readFileSync(path, 'utf8');
    const rewritten = text.split(`"${from}/`).join(`"${to}/`);
    if (rewritten !== text) writeFileSync(path, rewritten);
  }
}

/**
 * The reference's workspace manifest: its members narrowed to the trees copied (cargo refuses a
 * member glob that matches nothing, so the contexts and the bootstrap are listed the day they
 * exist), its version 0.1.0, its `[workspace.dependencies]` narrowed to what the copied crates
 * use; the lints and the package defaults travel whole.
 */
function cargoToml(spec: CreateSpec, text: string, name: string): string {
  const body = text.slice(text.indexOf('[workspace]'));
  const lines = body.split('\n');
  const kept: string[] = [];
  let section = '';
  for (const line of lines) {
    const header = line.match(/^\[([^\]]+)\]/);
    if (header) section = header[1];
    if (section === 'workspace' && /^members\s*=/.test(line)) {
      kept.push(`members = [${spec.members.map(member => `"${member}"`).join(', ')}]`);
      continue;
    }
    if (section === 'workspace.package' && /^version\s*=/.test(line)) {
      kept.push('version = "0.1.0"');
      continue;
    }
    if (section === 'workspace.dependencies' && /^[A-Za-z0-9_-]+\s*=/.test(line)) {
      const key = line.split('=')[0].trim();
      if (!spec.dependencies.includes(key)) continue;
    }
    kept.push(line);
  }
  const note = [
    `# ${name}: a workspace on the clean-ddd architecture, made by \`clean-ddd create\`. Every layer of every`,
    "# tree is a crate, and a crate's `[dependencies]` are its row of the dependency table in",
    '# conventions/architecture.yaml: the compiler holds the boundary, `cargo run -p conventions` proves it.',
    '# Add "src/contexts/*/*" to the members with your first context, and "src/bootstrap" with the composition root.',
    '',
  ].join('\n');
  return `${note}${kept
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()}\n`;
}

/** The reference's pyproject, renamed, at 0.1.0, its dependency list narrowed to what the copied files import; the rest (the dev group, ruff, mypy, pytest) travels whole. */
function pyproject(spec: CreateSpec, text: string, name: string): string {
  const body = text
    .slice(text.indexOf('[project]'))
    .replace(/^name = ".*"$/m, `name = "${name}"`)
    .replace(/^version = ".*"$/m, 'version = "0.1.0"')
    .replace(/^description = ".*"$/m, 'description = "An application on the clean-ddd architecture"')
    .replace(/^dependencies = \[\n([\s\S]*?)^\]/m, (_whole, lines: string) => {
      const kept = lines
        .split('\n')
        .filter(line => spec.dependencies.some(dependency => line.trim().startsWith(`"${dependency}`)));
      return `dependencies = [\n${kept.join('\n')}\n]`;
    });
  const note = [
    '# Created by `clean-ddd create` from the clean-ddd reference: the same project layout, the same',
    '# lints, the same checks; the dependencies are the ones the copied files import.',
    '',
  ].join('\n');
  return `${note}${body}`;
}
