#!/usr/bin/env tsx
/**
 * Checks that the conventions and the code agree. Runs in CI as `yarn check:conventions`.
 *
 * 1. The architecture contract is sound: schema version understood, unique rule ids, every
 *    reference and canonical file exists, every concept names rules that exist (ARCH-MAP-IS-REAL).
 * 2. The tree matches it: every directory under src/Contexts is a declared context with its wiring
 *    file and nothing but layers; the two trees beside the contexts hold only layers (ARCH-CONTEXT-DECLARED).
 * 3. README and CLAUDE.md show what the contract renders, between their markers (`--write` regenerates).
 * 4. Every relative link in README.md, CLAUDE.md, conventions/ and docs/ resolves.
 * 5. No `eslint-disable` anywhere in src/, except `no-console` in the console logger.
 * 6. The import rules generated from the contract behave: a table of probes says which imports each
 *    layer must refuse and which it must allow, and ESLint is asked about each.
 *
 * A client of tools/architecture-contract, like the CLI; it parses no YAML itself.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';

import {
  END_MARKER,
  RULES_MARKER,
  SECTION_MARKER,
  canImportAll,
  loadArchitectureContract,
  renderConceptLayer,
  renderDependencyTable,
  renderRulesList,
  renderRulesTable,
  renderTests,
  renderVocabulary,
  repositoryRoot,
  validateContract,
} from './architecture-contract';

const root = repositoryRoot();
const write = process.argv.includes('--write');
const problems: string[] = [];
const problem = (message: string) => problems.push(message);

// 1. The contract is sound

const contract = loadArchitectureContract(root);
problems.push(...validateContract(contract, root));

// 2. The tree matches the contract

const layers = contract.layers;
const contextsDir = join(root, 'src/Contexts');
for (const entry of readdirSync(contextsDir, { withFileTypes: true })) {
  if (entry.isDirectory() && !contract.contexts.includes(entry.name)) {
    problem(
      `ARCH-CONTEXT-DECLARED: src/Contexts/${entry.name} is not declared in ${contract.sources.architecture}, so no import rule applies to it`,
    );
  }
}
for (const context of contract.contexts) {
  const dir = join(contextsDir, context);
  if (!existsSync(dir)) {
    problem(
      `ARCH-CONTEXT-DECLARED: ${contract.sources.architecture} declares the context ${context}, which does not exist`,
    );
    continue;
  }
  if (!existsSync(join(dir, contract.wiring)))
    problem(`ARCH-CONTEXT-DECLARED: src/Contexts/${context} has no ${contract.wiring}`);
  for (const entry of readdirSync(dir)) {
    if (entry !== contract.wiring && !layers.includes(entry)) {
      problem(
        `ARCH-CONTEXT-DECLARED: src/Contexts/${context}/${entry} is neither a layer (${layers.join(', ')}) nor ${contract.wiring}`,
      );
    }
  }
}
for (const tree of [contract.architecture, contract.kernel]) {
  if (!existsSync(join(root, tree.path))) {
    problem(`ARCH-TREES: ${tree.path} (${tree.alias}) does not exist`);
    continue;
  }
  for (const entry of readdirSync(join(root, tree.path))) {
    if (!layers.includes(entry))
      problem(`ARCH-TREES: ${tree.path}/${entry} is not a layer: ${tree.alias} holds layers and nothing else`);
  }
}

// 3. README and CLAUDE.md show what the contract renders

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function renderInto(file: string, blocks: [string, string][]): void {
  let text = readFileSync(join(root, file), 'utf8');
  for (const [open, rendered] of blocks) {
    const pattern = new RegExp(`${escape(open)}\\n([\\s\\S]*?)\\n${escape(END_MARKER)}`);
    const match = text.match(pattern);
    if (!match) {
      problem(`${file} has no generated block for "${open}"`);
      continue;
    }
    if (match[1] !== rendered) {
      if (write) text = text.replace(pattern, `${open}\n${rendered}\n${END_MARKER}`);
      else problem(`${file}: the block "${open}" differs from what the contract renders; run yarn conventions:write`);
    }
  }
  if (write) writeFileSync(join(root, file), text);
}

renderInto('README.md', [
  [SECTION_MARKER('domain'), renderConceptLayer(contract, 'domain')],
  [SECTION_MARKER('application'), renderConceptLayer(contract, 'application')],
  [SECTION_MARKER('infrastructure'), renderConceptLayer(contract, 'infrastructure')],
  [SECTION_MARKER('presentation'), renderConceptLayer(contract, 'presentation')],
  [SECTION_MARKER('tests'), renderTests(contract)],
  [SECTION_MARKER('vocabulary'), renderVocabulary(contract)],
  [RULES_MARKER('rules'), renderRulesTable(contract)],
  [RULES_MARKER('dependencies'), renderDependencyTable(contract)],
]);
renderInto('CLAUDE.md', [[RULES_MARKER('rules'), renderRulesList(contract)]]);

// 4. Every relative link in the documentation resolves

const linksIn = (text: string) =>
  [...text.matchAll(/\]\(([^)\s]+)\)/g)].map(match => match[1]).filter(link => !/^[a-z]+:/.test(link));
const walk = (dir: string, ext: string): string[] =>
  readdirSync(join(root, dir), { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? walk(`${dir}/${entry.name}`, ext) : entry.name.endsWith(ext) ? [`${dir}/${entry.name}`] : [],
  );
for (const file of ['README.md', 'CLAUDE.md', ...walk('conventions', '.md'), ...walk('docs', '.md')]) {
  const base = dirname(join(root, file));
  for (const link of linksIn(readFileSync(join(root, file), 'utf8'))) {
    const [path] = link.split('#');
    if (path && !existsSync(resolve(base, path)))
      problem(`ARCH-MAP-IS-REAL: ${file} links to ${path}, which does not exist`);
  }
}

// 5. No eslint-disable, except the console logger's

const allowedDisables: Record<string, string> = {
  'src/Architecture/Infrastructure/Logging/ConsoleLogger.ts': 'no-console',
};
for (const file of walk('src', '.ts')) {
  for (const line of readFileSync(join(root, file), 'utf8').split('\n')) {
    const disable = line.match(/eslint-disable(?:-next-line|-line)?\s*([\w@/-]*)/);
    if (!disable || allowedDisables[file] === disable[1]) continue;
    problem(
      `ARCH-MAP-IS-REAL: ${file} silences ESLint with "${disable[0].trim()}"; fix the cause (a port, a move) instead`,
    );
  }
}

// 6. The generated import rules refuse and allow what the table says

const probes: [string, string, 'allowed' | 'refused'][] = [
  ['src/Contexts/Notes/Domain/Note/Probe.ts', '@SharedKernel/Domain', 'allowed'],
  ['src/Contexts/Notes/Domain/Note/Probe.ts', '@Architecture/Domain', 'allowed'],
  ['src/Contexts/Notes/Domain/Note/Probe.ts', './NoteTitle', 'allowed'],
  ['src/Contexts/Notes/Domain/Note/Probe.ts', '@Architecture/Application', 'refused'],
  ['src/Contexts/Notes/Domain/Note/Probe.ts', '@SharedKernel/Application', 'refused'],
  ['src/Contexts/Notes/Domain/Note/Probe.ts', '@Contexts/Notes/Application/Commands', 'refused'],
  ['src/Contexts/Notes/Domain/Note/Probe.ts', '@Contexts/Security/Domain/Account/Account', 'refused'],
  ['src/Contexts/Notes/Domain/Note/Probe.ts', 'fastify', 'refused'],
  ['src/Contexts/Notes/Domain/Note/Probe.ts', '../NoteExceptions', 'refused'],
  ['src/Contexts/Notes/Domain/Note/Probe.ts', './Ports/INoteRepository', 'refused'],
  [
    'src/Contexts/Notes/Application/Commands/Probe/Probe.ts',
    '@SharedKernel/Application/IntegrationEvents/NoteIntegrationEvents',
    'allowed',
  ],
  [
    'src/Contexts/Notes/Application/Commands/Probe/Probe.ts',
    '@Contexts/Notes/Infrastructure/Repositories/InMemoryNoteRepository',
    'refused',
  ],
  ['src/Contexts/Notes/Application/Commands/Probe/Probe.ts', '@Contexts/Security/Domain/Account/Account', 'refused'],
  [
    'src/Contexts/Notes/Application/Commands/Probe/Probe.spec.ts',
    '@Contexts/Notes/Infrastructure/Repositories/InMemoryNoteRepository',
    'allowed',
  ],
  ['src/Contexts/Notes/Infrastructure/Probe.ts', '@Contexts/Security/Domain/Account/Ports/IAccountQueries', 'allowed'],
  ['src/Contexts/Notes/Infrastructure/Probe.ts', 'jose', 'allowed'],
  ['src/Contexts/Notes/Infrastructure/Probe.ts', '@Contexts/Security/Application/Commands', 'refused'],
  ['src/Contexts/Notes/Infrastructure/Probe.ts', '@Contexts/Security/module.local', 'refused'],
  ['src/Contexts/Notes/Infrastructure/Probe.ts', '@Bootstrap/Fastify/application.settings', 'refused'],
  ['src/Contexts/Notes/Presentation/API/Probe.ts', 'fastify', 'allowed'],
  [
    'src/Contexts/Notes/Presentation/API/Probe.ts',
    '@Contexts/Notes/Infrastructure/Repositories/InMemoryNoteRepository',
    'refused',
  ],
  ['src/Contexts/Notes/Presentation/API/Probe.e2e.spec.ts', '@Bootstrap/Fastify/application.spec-helper', 'allowed'],
  ['src/Contexts/Notes/Presentation/API/Probe.e2e.spec.ts', '@Contexts/Notes/Domain/Note/Note', 'refused'],
  ['src/Contexts/Notes/module.local.ts', '@Contexts/Security/module.local', 'allowed'],
  ['src/Contexts/Notes/module.local.ts', '@Bootstrap/Fastify/application.settings', 'allowed'],
  ['src/Contexts/Notes/module.local.ts', '@Contexts/Security/Domain/Account/Account', 'refused'],
  // the building blocks: no context, no shared kernel, inner layers only
  ['src/Architecture/Domain/Probe.ts', './Id', 'allowed'],
  ['src/Architecture/Domain/Probe.ts', '@Contexts/Notes/Domain/Note/Note', 'refused'],
  ['src/Architecture/Domain/Probe.ts', '@SharedKernel/Domain', 'refused'],
  ['src/Architecture/Application/Probe.ts', '@Architecture/Domain', 'allowed'],
  ['src/Architecture/Application/Probe.ts', '@SharedKernel/Application/Guards', 'refused'],
  ['src/Architecture/Application/Probe.ts', '@Architecture/Infrastructure/EventBus/InMemoryEventBus', 'refused'],
  // the shared kernel: built on the building blocks, knows no context
  ['src/SharedKernel/Domain/Probe.ts', '@Architecture/Domain', 'allowed'],
  ['src/SharedKernel/Domain/Probe.ts', '@Architecture/Application', 'refused'],
  ['src/SharedKernel/Domain/Probe.ts', '@Contexts/Security/Domain/Account/Account', 'refused'],
  ['src/SharedKernel/Application/Probe.ts', '@Architecture/Application', 'allowed'],
  ['src/SharedKernel/Application/Probe.ts', '@Architecture/Infrastructure/DataSources/InMemoryDataSource', 'refused'],
];
const verdicts = await canImportAll(
  probes.map(([file, specifier]) => [file, specifier]),
  root,
);
probes.forEach(([file, specifier, expected], index) => {
  const verdict = verdicts[index];
  const actual = verdict.allowed ? 'allowed' : 'refused';
  if (actual !== expected)
    problem(`ARCH-MAP-IS-REAL: ${file} importing '${specifier}' is ${actual}, expected ${expected}`);
  if (!verdict.allowed && !verdict.rule)
    problem(`ARCH-MAP-IS-REAL: the refusal of '${specifier}' from ${file} names no rule id`);
});

// Verdict

if (problems.length) {
  for (const message of problems) process.stderr.write(`✗ ${message}\n`);
  process.exit(1);
}
process.stdout.write(
  `✓ contract v${contract.schemaVersion}: ${contract.rules.length} rules, ${contract.concepts.length} concepts, ${contract.contexts.length} contexts match the tree; README and CLAUDE.md are rendered from it; every documentation link resolves; no eslint-disable; ${probes.length} import probes behave and name their rule.\n`,
);
