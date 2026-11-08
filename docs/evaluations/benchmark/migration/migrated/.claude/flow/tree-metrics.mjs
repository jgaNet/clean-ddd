#!/usr/bin/env node
/**
 * What a run wrote, counted the same way for every arm (docs/evaluations/benchmark/control):
 *
 *   node .claude/flow/tree-metrics.mjs --project <dir> --base <created commit> --ref <ref> [--out <file.json>]
 *
 * From the diff between the created commit and the run's head, TypeScript under `src/` only: the
 * lines added to source files and to test files, the files touched; and in the tree at the head,
 * the number of test cases, the source files and the largest of them. Descriptive, not a grade:
 * more lines is neither better nor worse until read beside what the lines bought.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const option = name => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : undefined);
const required = name => option(name) ?? (process.stderr.write(`--${name} is required\n`), process.exit(2));
const project = resolve(required('project'));
const base = required('base');
const ref = required('ref');
const git = (...gitArgs) =>
  execFileSync('git', gitArgs, { cwd: project, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

const isTest = path => /\.(spec|test)\.ts$/.test(path);
const isSource = path => path.startsWith('src/') && path.endsWith('.ts') && !path.endsWith('.d.ts');

const added = { source: 0, tests: 0 };
// Lines removed: what the run rewrote of what was there before it, its own earlier features included.
const removed = { source: 0, tests: 0 };
const touched = new Set();
for (const line of git('diff', '--numstat', `${base}..${ref}`).split('\n').filter(Boolean)) {
  const [plus, minus, path] = line.split('\t');
  if (!isSource(path) || plus === '-') continue;
  touched.add(path);
  added[isTest(path) ? 'tests' : 'source'] += Number(plus);
  removed[isTest(path) ? 'tests' : 'source'] += Number(minus);
}

const files = git('ls-tree', '-r', '--name-only', ref).split('\n').filter(isSource);
const lines = path => git('show', `${ref}:${path}`).split('\n').length;
const sources = files.filter(path => !isTest(path)).map(path => ({ path, lines: lines(path) }));
const testCases = files
  .filter(isTest)
  .reduce(
    (sum, path) => sum + (git('show', `${ref}:${path}`).match(/^\s*(it|test)(\.each\(.*\))?\(/gm)?.length ?? 0),
    0,
  );
const largest = sources.reduce((a, b) => (b.lines > a.lines ? b : a), { path: '', lines: 0 });

const report = {
  project,
  base,
  ref,
  added,
  removed,
  filesTouched: touched.size,
  sourceFiles: sources.length,
  testFiles: files.filter(isTest).length,
  testCases,
  largestSource: largest,
};
const out = option('out');
if (out) writeFileSync(resolve(out), `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
