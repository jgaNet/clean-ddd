#!/usr/bin/env node
/**
 * Checks that the conventions and the code agree. Runs in CI as `yarn check:conventions`.
 *
 * 1. conventions/architecture.yaml describes the tree: every directory under src/Contexts is a
 *    declared context (so the import rules apply to it), has its wiring file, and contains
 *    nothing but the declared layers; the two trees beside the contexts (the building blocks
 *    and the shared kernel) contain nothing but layers either.
 * 2. conventions/concepts.yaml names real files: every link in it resolves, and the README's map
 *    tables are exactly what it renders (`--write` regenerates them).
 * 3. Every relative link in README.md, CLAUDE.md, conventions/ and docs/ resolves.
 * 4. No `eslint-disable` anywhere in src/, except `no-console` in the console logger: a boundary
 *    violation is fixed with a port or a move, never silenced.
 * 5. The import rules generated from architecture.yaml behave: a table of probes says which
 *    imports each layer must refuse and which it must allow, and ESLint is asked about each.
 *
 * No dependency but js-yaml and eslint; no framework. Read it top to bottom.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { load } from 'js-yaml';
import { ESLint } from 'eslint';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const write = process.argv.includes('--write');
const problems = [];
const problem = message => problems.push(message);
const yaml = file => load(readFileSync(join(root, file), 'utf8'));

// 1. The tree matches architecture.yaml

const architecture = yaml('conventions/architecture.yaml');
const layers = Object.keys(architecture.layers);
const contextsDir = join(root, 'src/Contexts');
const onDisk = readdirSync(contextsDir, { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => entry.name);

for (const context of onDisk) {
  if (!architecture.contexts.includes(context)) {
    problem(
      `src/Contexts/${context} is not declared in conventions/architecture.yaml, so no import rule applies to it`,
    );
  }
}
for (const context of architecture.contexts) {
  const dir = join(contextsDir, context);
  if (!existsSync(dir)) {
    problem(`conventions/architecture.yaml declares the context ${context}, which does not exist`);
    continue;
  }
  if (!existsSync(join(dir, architecture.wiring))) {
    problem(`src/Contexts/${context} has no ${architecture.wiring}`);
  }
  for (const entry of readdirSync(dir)) {
    if (entry !== architecture.wiring && !layers.includes(entry)) {
      problem(`src/Contexts/${context}/${entry} is neither a layer (${layers.join(', ')}) nor ${architecture.wiring}`);
    }
  }
}

for (const tree of [architecture.architecture, architecture.kernel]) {
  if (!existsSync(join(root, tree.path))) {
    problem(`${tree.path} (${tree.alias}) does not exist`);
    continue;
  }
  for (const entry of readdirSync(join(root, tree.path))) {
    if (!layers.includes(entry)) {
      problem(
        `${tree.path}/${entry} is not a layer (${layers.join(', ')}): ${tree.alias} holds layers and nothing else`,
      );
    }
  }
}

// 2. concepts.yaml names real files and the README renders it

const linksIn = text =>
  [...text.matchAll(/\]\(([^)\s]+)\)/g)].map(match => match[1]).filter(link => !/^[a-z]+:/.test(link));
const checkLinks = (text, from) => {
  for (const link of linksIn(text)) {
    const [path] = link.split('#');
    if (path && !existsSync(join(root, path))) problem(`${from} links to ${path}, which does not exist`);
  }
};

const concepts = yaml('conventions/concepts.yaml');
const escape = cell => String(cell ?? '').replace(/\|/g, '\\|');
const renderSection = ({ columns, rows }) => {
  const keys = Object.keys(columns);
  const line = cells => `| ${cells.join(' | ')} |`;
  return [
    line(keys.map(key => columns[key])),
    line(keys.map(() => '---')),
    ...rows.map(row => line(keys.map(key => escape(row[key])))),
  ].join('\n');
};

let readme = readFileSync(join(root, 'README.md'), 'utf8');
for (const section of concepts.sections) {
  for (const row of section.rows)
    checkLinks(Object.values(row).join(' '), `conventions/concepts.yaml (${section.id}: ${Object.values(row)[0]})`);

  const open = `<!-- generated from conventions/concepts.yaml (${section.id}); edit the YAML, then run yarn conventions:write -->`;
  const close = '<!-- end generated -->';
  const pattern = new RegExp(`${open.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n([\\s\\S]*?)\\n${close}`);
  const match = readme.match(pattern);
  if (!match) {
    problem(`README.md has no generated block for the section "${section.id}" (expected the markers around its table)`);
    continue;
  }
  const rendered = renderSection(section);
  if (match[1] !== rendered) {
    if (write) readme = readme.replace(pattern, `${open}\n${rendered}\n${close}`);
    else
      problem(`README.md section "${section.id}" differs from conventions/concepts.yaml; run yarn conventions:write`);
  }
}
if (write) writeFileSync(join(root, 'README.md'), readme);

// 3. Every relative link in the documentation resolves

const markdownFiles = [
  'README.md',
  'CLAUDE.md',
  ...readdirSync(join(root, 'conventions'))
    .filter(f => f.endsWith('.md'))
    .map(f => `conventions/${f}`),
  ...readdirSync(join(root, 'docs'), { recursive: true })
    .filter(f => String(f).endsWith('.md'))
    .map(f => `docs/${f}`),
];
for (const file of markdownFiles) {
  const base = dirname(join(root, file));
  for (const link of linksIn(readFileSync(join(root, file), 'utf8'))) {
    const [path] = link.split('#');
    if (path && !existsSync(resolve(base, path))) problem(`${file} links to ${path}, which does not exist`);
  }
}

// 4. No eslint-disable, except the console logger's

const allowedDisables = { 'src/Architecture/Infrastructure/Logging/ConsoleLogger.ts': 'no-console' };
const walk = dir =>
  readdirSync(join(root, dir), { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? walk(`${dir}/${entry.name}`) : entry.name.endsWith('.ts') ? [`${dir}/${entry.name}`] : [],
  );
for (const file of walk('src')) {
  for (const line of readFileSync(join(root, file), 'utf8').split('\n')) {
    const disable = line.match(/eslint-disable(?:-next-line|-line)?\s*([\w@/-]*)/);
    if (!disable) continue;
    if (allowedDisables[file] === disable[1]) continue;
    problem(`${file} silences ESLint with "${disable[0].trim()}"; fix the cause (a port, a move) instead`);
  }
}

// 5. The generated import rules refuse and allow what the table says

const probes = [
  // [file the import sits in, what it imports, expected]
  ['src/Contexts/Notes/Domain/Note/Probe.ts', '@SharedKernel/Domain', 'allowed'],
  ['src/Contexts/Notes/Domain/Note/Probe.ts', '@Architecture/Domain', 'allowed'],
  ['src/Contexts/Notes/Domain/Note/Probe.ts', '@Architecture/Application', 'refused'],
  ['src/Contexts/Notes/Domain/Note/Probe.ts', './NoteTitle', 'allowed'],
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
const eslint = new ESLint({ cwd: root });
for (const [file, specifier, expected] of probes) {
  const [result] = await eslint.lintText(`import { probe } from '${specifier}';\nexport const p = probe;\n`, {
    filePath: join(root, file),
  });
  const refused = result.messages.some(message => message.ruleId === 'no-restricted-imports');
  const actual = refused ? 'refused' : 'allowed';
  if (actual !== expected) problem(`import rules: ${file} importing '${specifier}' is ${actual}, expected ${expected}`);
}

// Verdict

if (problems.length) {
  for (const message of problems) process.stderr.write(`✗ ${message}\n`);
  process.exit(1);
}
const rows = concepts.sections.reduce((n, section) => n + section.rows.length, 0);
process.stdout.write(
  `✓ ${architecture.contexts.length} contexts match conventions/architecture.yaml; ${rows} concept rows name existing files and the README shows them; every documentation link resolves; no eslint-disable; ${probes.length} import probes behave.\n`,
);
