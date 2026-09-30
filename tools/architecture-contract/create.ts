import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { dump, load } from 'js-yaml';

import { ArchitectureContract, Concept, Rule } from './types';
import { loadArchitectureContract, repositoryRoot } from './load';
import {
  END_MARKER,
  RULES_MARKER,
  SECTION_MARKER,
  renderConceptLayer,
  renderRulesList,
  renderRulesTable,
} from './render';

/**
 * `yarn architecture create <dir>`: a new application with this repository's architecture and
 * none of its business.
 *
 * The rule that keeps it honest: **it copies what exists and generates the rest from the
 * contract; it templates nothing.** A scaffolder that carried its own copy of the building
 * blocks, or its own wording of the rules, would drift from the reference within a month. So
 * the building blocks, the shared kernel, the tooling and the configuration are copied
 * verbatim from the repository it runs in, and the new README, CLAUDE.md and conventions are
 * rendered from the same contract that renders this repository's own — which is why the
 * generated project passes the same six checks on its first run.
 *
 * What it does *not* give you is an application: there are no contexts, no composition root
 * and no routes, because those are the business, and copying someone else's business is how a
 * reference implementation becomes a framework. The generated CLAUDE.md says what to write
 * first and `yarn architecture checklist context` says what it is made of.
 */

/** Copied as they are: the architecture, the shared kernel's model, the tooling, the configuration. */
const COPY_VERBATIM = [
  'src/Architecture',
  'src/SharedKernel/Domain',
  'src/SharedKernel/Application/Guards.ts',
  'tools/architecture-contract',
  'tools/check-conventions.ts',
  'tsconfig.json',
  'tsconfig.test.json',
  'tsconfig.tools.json',
  'jest.config.js',
  'eslint.config.js',
  '.prettierrc.json',
  '.prettierignore',
  '.editorconfig',
  '.nvmrc',
];

/** Copied without their specs: those assert on this repository's own contract. */
const WITHOUT_SPECS = ['tools/architecture-contract'];

/** Scripts a new application starts with: the checks, the contract, the formatting. No app to start yet. */
const SCRIPTS = [
  'typecheck',
  'test',
  'test:units',
  'test:e2e',
  'lint',
  'check:conventions',
  'conventions:write',
  'architecture',
  'format',
  'format:check',
];

/** Dependencies the building blocks and the tooling actually import. The rest is the reference's business. */
const DEPENDENCIES = ['uuid'];
const DEV_DEPENDENCIES = [
  '@jest/globals',
  '@types/jest',
  '@types/node',
  'cross-env',
  'eslint',
  'jest',
  'js-yaml',
  'prettier',
  'ts-jest',
  'tsx',
  'typescript',
  'typescript-eslint',
];

const exists = (root: string, path: string) => existsSync(join(root, path));

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
const keepExisting = <T extends { references: string[] }>(item: T, target: string): T => ({
  ...item,
  references: item.references.filter(reference => exists(target, reference)),
});

const leanRule = (rule: Rule, target: string): Rule => ({
  ...keepExisting(rule, target),
  statement: delinkify(rule.statement, target),
  why: delinkify(rule.why, target),
  remediation: delinkify(rule.remediation, target),
});

/**
 * Walks the parsed table and drops what this application cannot have yet: a reference or an
 * example pointing at a file nobody copied. A rule keeps its statement, its reason and its
 * remediation — those are the architecture — and loses only its pointers.
 */
function prune(node: unknown, target: string): void {
  if (Array.isArray(node)) return node.forEach(child => prune(child, target));
  if (typeof node !== 'object' || node === null) return;
  const record = node as Record<string, unknown>;
  if (Array.isArray(record.references)) {
    record.references = (record.references as string[]).filter(reference => exists(target, reference));
  }
  if (typeof record.example === 'string' && !exists(target, record.example)) delete record.example;
  for (const value of Object.values(record)) prune(value, target);
}

/**
 * A concept survives if at least one file that shows it was copied — `aggregate-root` keeps
 * `AggregateRoot.ts` and loses `Note.ts`, which is the reference's business. Its lists are
 * narrowed to what is really there.
 */
const surviving = (concept: Concept, target: string): Concept | undefined => {
  const canonical = concept.canonical.filter(file => exists(target, file));
  if (!canonical.length) return undefined;
  return {
    ...concept,
    canonical,
    examples: concept.examples.filter(file => exists(target, file)),
    // The cell is rebuilt from what survived; the note keeps its words without its dead links.
    example: undefined,
    description: delinkify(concept.description, target),
  };
};

export interface CreatedApplication {
  directory: string;
  name: string;
  files: number;
  concepts: number;
  rules: number;
}

export function createApplication(
  directory: string,
  name: string,
  source: string = repositoryRoot(),
): CreatedApplication {
  if (existsSync(directory) && readdirSync(directory).length) {
    throw new Error(`${directory} is not empty; a new application is created in an empty directory`);
  }
  const contract = loadArchitectureContract(source);

  // 1. Copy the architecture, the shared kernel, the tooling and the configuration. The
  //    building blocks come with their specs — they are the best description of what a
  //    Result, an aggregate or a publish-after-commit does — but the tooling's stay behind:
  //    they assert on this repository's contract (that Notes is a context, that the example
  //    plan validates), so elsewhere they would fail while saying nothing about the project.
  //    What the tools do for the new application is proved by `yarn check:conventions`,
  //    which runs them against its own contract.
  for (const path of COPY_VERBATIM) {
    const to = join(directory, path);
    mkdirSync(dirname(to), { recursive: true });
    const withoutSpecs = WITHOUT_SPECS.includes(path);
    cpSync(join(source, path), to, { recursive: true, filter: from => !(withoutSpecs && from.endsWith('.spec.ts')) });
  }

  // 2. The places a new application fills in. The integration events folder is where its
  //    contexts will publish; src/Contexts is where they will live.
  mkdirSync(join(directory, 'src/SharedKernel/Application/IntegrationEvents'), { recursive: true });
  writeFileSync(
    join(directory, 'src/SharedKernel/Application/IntegrationEvents/README.md'),
    [
      '# Integration events',
      '',
      'The published contracts between this application’s contexts: named, versionable payloads,',
      'one file per subject (`OrderIntegrationEvents.ts`). Both sides see the same file, so changing',
      'one is a visible, reviewable change to a contract.',
      '',
      'Nothing here yet: a contract appears when a first consumer needs a fact.',
      '`yarn architecture checklist integration-event` says what one is made of.',
      '',
    ].join('\n'),
  );
  mkdirSync(join(directory, 'src/Contexts'), { recursive: true });
  writeFileSync(
    join(directory, 'src/Contexts/README.md'),
    [
      '# Contexts',
      '',
      'One folder per bounded context, each with `Domain`, `Application`, `Infrastructure`,',
      '`Presentation` and a `module.local.ts`, and each declared in `conventions/architecture.yaml`',
      'so that the import rules apply to it.',
      '',
      'Nothing here yet. `yarn architecture checklist context` says what a context is made of, and',
      '`yarn architecture checklist aggregate` what goes in its Domain.',
      '',
    ].join('\n'),
  );

  // 3. The contract, kept whole but emptied of this repository's business.
  const rules: Rule[] = contract.rules.map(rule => leanRule(rule, directory));
  const concepts = contract.concepts
    .map(concept => surviving(concept, directory))
    .filter((concept): concept is Concept => concept !== undefined)
    .map(concept => keepExisting(concept, directory));
  writeContract(directory, source, contract, concepts);

  // 4. The documents, rendered from that contract exactly as this repository renders its own.
  const lean: ArchitectureContract = { ...contract, rules, concepts, contexts: [] };
  writeFileSync(join(directory, 'README.md'), readme(lean, name));
  writeFileSync(join(directory, 'CLAUDE.md'), claude(lean, name));
  mkdirSync(join(directory, 'docs/adr'), { recursive: true });
  writeFileSync(join(directory, 'docs/adr/README.md'), adrIndex());
  writeFileSync(join(directory, 'package.json'), packageJson(source, name));
  writeFileSync(join(directory, '.gitignore'), 'node_modules\ndist\ncoverage\n*.tsbuildinfo\n');

  return {
    directory,
    name,
    files: count(directory),
    concepts: concepts.length,
    rules: rules.length,
  };
}

function count(directory: string): number {
  return readdirSync(directory, { withFileTypes: true, recursive: true }).filter(entry => entry.isFile()).length;
}

/** The same architecture, with no contexts of its own yet and no reference to a file that was not copied. */
function writeContract(directory: string, source: string, contract: ArchitectureContract, concepts: Concept[]): void {
  mkdirSync(join(directory, 'conventions/plans'), { recursive: true });
  // The same table, as data: its contexts emptied, and every reference or example that points at
  // a file this application does not have removed. The header comment — the vocabulary the table
  // is read with — is carried over; the rest is rewritten from the parsed document.
  const rawText = readFileSync(join(source, contract.sources.architecture), 'utf8');
  const header = rawText.slice(0, rawText.indexOf('schemaVersion:'));
  const table = load(rawText) as Record<string, unknown>;
  table.contexts = [];
  prune(table, directory);
  // A checklist points at the concept that shows it; if no file shows it here yet, the pointer goes.
  const known = new Set(concepts.map(concept => concept.id));
  for (const checklist of Object.values((table.checklists as Record<string, { concept?: string }>) ?? {})) {
    if (checklist.concept && !known.has(checklist.concept)) delete checklist.concept;
  }
  const note = [
    '# Created by `yarn architecture create` from the clean-ddd reference. `contexts` is empty:',
    '# declare your first one there, or no import rule applies to its files. The URL shapes in',
    '# `http.verbs` are the reference’s (`GET /notes/:id`); what they teach is the grammar — which',
    '# verb a use case takes, and what the URL names — so rewrite them in your own nouns as your',
    '# first routes appear.',
    '',
    '',
  ].join('\n');
  writeFileSync(
    join(directory, contract.sources.architecture),
    `${header}${note}${dump(table, { lineWidth: 110, noRefs: true })}`,
  );

  writeFileSync(
    join(directory, contract.sources.concepts),
    [
      '# The architectural vocabulary of this application: every concept, with the file that shows it.',
      '# The README’s map tables are rendered from here (`yarn conventions:write`), and',
      '# `yarn architecture concept <id>` answers from it. A concept whose canonical file this',
      '# application does not have yet was dropped when it was created; add the row back with the',
      '# file when you write it.',
      '',
      dump({ schemaVersion: 1, concepts, tests: [], vocabulary: [] }, { lineWidth: 110, noRefs: true }),
    ].join('\n'),
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
      '| [`architecture.yaml`](architecture.yaml) | the contexts, the layers, which layer may import from which, the rules, the HTTP verbs, the checklists and the two modes |',
      '| [`concepts.yaml`](concepts.yaml) | every concept, with the canonical file that shows it |',
      '| [`plans/`](plans) | feature plans: what a change intends, checked before it is written |',
      '',
      '```bash',
      'yarn check:conventions    # the contract is sound and the tree matches it',
      'yarn conventions:write    # regenerate the rendered blocks in README.md and CLAUDE.md',
      'yarn architecture …       # ask the contract: inspect, rules, concepts, verbs, checklists, plan, mode, can-import',
      '```',
      '',
      'Adding a context means adding it to `contexts` in `architecture.yaml`, or no import rule applies to it.',
      '',
    ].join('\n'),
  );
  writeFileSync(
    join(directory, 'conventions/plans/README.md'),
    [
      '# Feature plans',
      '',
      'A plan is what a change intends, written before the code: `yarn architecture plan validate <file>`',
      'checks it against the contract and the tree, `plan explain <file>` expands it into the files, the',
      'rules and the examples it implies.',
      '',
      'Every plan here is validated by `yarn check:conventions`, so none of them can rot.',
      '',
    ].join('\n'),
  );
}

const generated = (marker: string, body: string) => `${marker}\n${body}\n${END_MARKER}`;

function readme(contract: ArchitectureContract, name: string): string {
  const layers = (['domain', 'application', 'infrastructure', 'presentation'] as const).filter(layer =>
    contract.concepts.some(concept => concept.layer === layer),
  );
  return [
    `# ${name}`,
    '',
    'An application built on the Clean Architecture and Domain-Driven Design reference implementation',
    '[clean-ddd](https://github.com/jgaNet/clean-ddd): its building blocks, its shared kernel, its',
    'architecture contract and its checks, with none of its business.',
    '',
    '## What is here',
    '',
    '```',
    'src/Architecture/     the building blocks: Entity, AggregateRoot, ValueObject, Result, the handlers,',
    '                      the execution context, the event bus, the in-memory adapters. Mechanics, no vocabulary.',
    'src/SharedKernel/     what every context will agree on: Email, Role, requireSignedIn, and the',
    '                      integration events your contexts will publish.',
    'src/Contexts/         your bounded contexts. Empty: this is the part that is yours.',
    'conventions/          the architecture as data; the import rules are generated from it.',
    'tools/                the contract API, its CLI and the conventions check.',
    '```',
    '',
    '## First steps',
    '',
    '```bash',
    'yarn install',
    'yarn check:conventions            # the contract is sound and the tree matches it',
    'yarn test:units                   # the building blocks come with their own specs',
    'yarn architecture inspect         # what the contract holds',
    'yarn architecture checklist context   # what your first context is made of',
    '```',
    '',
    'Then: name your first context in `conventions/architecture.yaml`, create it under `src/Contexts`,',
    'and write your composition root in `src/Bootstrap`. `yarn architecture checklist aggregate` says',
    'what goes in its Domain, and `yarn architecture can-import <file> <specifier>` answers, before you',
    'write an import, whether the rules allow it.',
    '',
    '## The rules, and how they are enforced',
    '',
    'Every rule has a stable id; `yarn architecture rule <ID>` explains it, `--json` for a tool.',
    '',
    generated(RULES_MARKER('rules'), renderRulesTable(contract)),
    '',
    '## The map: concept → file',
    '',
    'One canonical example per concept, rendered from `conventions/concepts.yaml`.',
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

function claude(contract: ArchitectureContract, name: string): string {
  return [
    `# Working on ${name} (guide for AI assistance)`,
    '',
    'This application is built on the [clean-ddd](https://github.com/jgaNet/clean-ddd) architecture:',
    'the rules below are generated from [`conventions/architecture.yaml`](conventions/architecture.yaml),',
    'and the same file generates the import rules ESLint enforces. Ask the contract before guessing.',
    '',
    '## Commands',
    '',
    '```bash',
    'yarn check:conventions            # the contract is sound, the tree matches it, the documents are rendered from it',
    'yarn typecheck | lint | test:units | test:e2e | format:check',
    'yarn architecture inspect | rules | concepts | verbs | checklists',
    'yarn architecture rule <ID> | concept <id> | verb <intent> | checklist <kind> | place <kind>',
    'yarn architecture can-import <file> <specifier> …     # before you write the import',
    'yarn architecture plan validate|explain <file>        # a change, stated before it is written',
    'yarn architecture mode feature|architecture           # which rules this change is held to',
    '```',
    '',
    '## The rules (enforced)',
    '',
    generated(RULES_MARKER('rules'), renderRulesList(contract)),
    '',
    '## How to add a feature',
    '',
    'Run `yarn architecture checklist <kind>` for the file list, and `yarn architecture verb <intent>`',
    'for the route. In short: the domain first (a behaviour on the aggregate that enforces the rule and',
    'records an event), then the command or query handler, then the adapter only if a port changed, then',
    'the route, then the wiring in `module.local.ts`. A rule that spans aggregates or needs a port is a',
    'domain service. Expected failures are `Result` values, never thrown.',
    '',
    '## Things to avoid',
    '',
    '- A generic `Mapper`, `Repository<T>`, `Saga`, service locator or DI container.',
    '- Fixing a boundary violation with an `eslint-disable` instead of a port: `yarn check:conventions` refuses one.',
    '- Changing anything under `src/Architecture`, `src/SharedKernel` or `conventions` while adding a feature:',
    '  `yarn architecture mode feature` will say so, and that is a finding, not a detour.',
    '',
  ].join('\n');
}

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

function packageJson(source: string, name: string): string {
  const reference = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>;
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
    engines: unknown;
  };
  const pick = (from: Record<string, string>, keys: string[]) =>
    Object.fromEntries(keys.filter(key => from[key]).map(key => [key, from[key]]));

  return `${JSON.stringify(
    {
      name,
      version: '0.1.0',
      private: true,
      type: 'module',
      engines: reference.engines,
      scripts: pick(reference.scripts, SCRIPTS),
      dependencies: pick(reference.dependencies, DEPENDENCIES),
      devDependencies: pick(reference.devDependencies, DEV_DEPENDENCIES),
    },
    null,
    2,
  )}\n`;
}
