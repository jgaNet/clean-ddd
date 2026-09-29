#!/usr/bin/env node
/**
 * Checks that the conventions and the code agree. Runs in CI as `yarn check:conventions`.
 *
 * 1. conventions/architecture.yaml describes the tree: every context under src/Contexts is
 *    declared (so the import rules apply to it), has its wiring file, and contains nothing but
 *    the declared layers.
 * 2. conventions/concepts.yaml names real files: every link in it resolves, and the README's map
 *    tables are exactly what it renders (`--write` regenerates them).
 * 3. Every relative link in README.md, CLAUDE.md, conventions/ and docs/ resolves.
 *
 * No dependency but js-yaml; no framework. Read it top to bottom.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { load } from 'js-yaml';

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
  .filter(entry => entry.isDirectory() && entry.name !== architecture.kernel)
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

// Verdict

if (problems.length) {
  for (const message of problems) process.stderr.write(`✗ ${message}\n`);
  process.exit(1);
}
const rows = concepts.sections.reduce((n, section) => n + section.rows.length, 0);
process.stdout.write(
  `✓ ${architecture.contexts.length} contexts match conventions/architecture.yaml; ${rows} concept rows name existing files and the README shows them; every documentation link resolves.\n`,
);
