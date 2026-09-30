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
 * 6. Every feature plan under conventions/plans is legal against the contract, so the examples
 *    cannot rot.
 * 7. The import rules generated from the contract behave: a table of probes says which imports each
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
  generateProbes,
  explainPlan,
  loadFeaturePlan,
  validatePlan,
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

/** A section with nothing in it yet (a new application has no vocabulary) needs no block. */
const nonEmpty = (blocks: [string, string, boolean][]): [string, string][] =>
  blocks.filter(([, , has]) => has).map(([marker, rendered]) => [marker, rendered]);

const layerHas = (layer: 'domain' | 'application' | 'infrastructure' | 'presentation') =>
  contract.concepts.some(concept => concept.layer === layer);

renderInto(
  'README.md',
  nonEmpty([
    [SECTION_MARKER('domain'), renderConceptLayer(contract, 'domain'), layerHas('domain')],
    [SECTION_MARKER('application'), renderConceptLayer(contract, 'application'), layerHas('application')],
    [SECTION_MARKER('infrastructure'), renderConceptLayer(contract, 'infrastructure'), layerHas('infrastructure')],
    [SECTION_MARKER('presentation'), renderConceptLayer(contract, 'presentation'), layerHas('presentation')],
    [SECTION_MARKER('tests'), renderTests(contract), contract.tests.length > 0],
    [SECTION_MARKER('vocabulary'), renderVocabulary(contract), contract.vocabulary.length > 0],
    [RULES_MARKER('rules'), renderRulesTable(contract), true],
    [RULES_MARKER('dependencies'), renderDependencyTable(contract), contract.contexts.length > 0],
  ]),
);
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

// 6. Every feature plan is legal

const plansDir = join(root, 'conventions/plans');
if (existsSync(plansDir)) {
  for (const entry of readdirSync(plansDir).filter(name => name.endsWith('.yaml'))) {
    const file = `conventions/plans/${entry}`;
    try {
      const plan = loadFeaturePlan(file, root);
      for (const wrong of validatePlan(plan, contract, root)) problem(`${file}: ${wrong}`);
      explainPlan(plan, contract); // it must expand without throwing
    } catch (error) {
      problem(`${file}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

// 7. The generated import rules refuse and allow what the table says

const probes = generateProbes(contract);
const verdicts = await canImportAll(
  probes.map(probe => [probe.file, probe.specifier] as [string, string]),
  root,
);
probes.forEach((probe, index) => {
  const verdict = verdicts[index];
  const actual = verdict.allowed ? 'allowed' : 'refused';
  if (actual !== probe.expected) {
    problem(`${probe.rule}: ${probe.file} importing '${probe.specifier}' is ${actual}, expected ${probe.expected}`);
  }
  if (!verdict.allowed && !verdict.rule) {
    problem(`${probe.rule}: the refusal of '${probe.specifier}' from ${probe.file} names no rule id`);
  }
});

// Verdict

if (problems.length) {
  for (const message of problems) process.stderr.write(`✗ ${message}\n`);
  process.exit(1);
}
process.stdout.write(
  `✓ contract v${contract.schemaVersion}: ${contract.rules.length} rules, ${contract.concepts.length} concepts, ${contract.contexts.length} contexts match the tree; README and CLAUDE.md are rendered from it; every documentation link resolves; no eslint-disable; ${probes.length} import probes behave and name their rule.\n`,
);
