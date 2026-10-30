#!/usr/bin/env node
/**
 * The mechanical half of the benchmark's rubric (docs/evaluations/benchmark/rubric.md), on one
 * run's final tree, whatever the arm:
 *
 *   node .claude/flow/grade.mjs --project <dir> --ref <ref> --base <created commit> --kit <dir> [--out <file.json>]
 *
 * In a worktree of its own at `ref`, it copies the kit's acceptance tests beside their support
 * into `src/Bootstrap/Fastify/Acceptance/`, then runs:
 *   M1  the gate on the whole run, from the created commit, in the architecture mode;
 *   M2  each feature's acceptance test, on its own;
 *   M3  each feature's storm, from the kit, against the code: what it still owes.
 * The read half (R) is the grader's, with evidence; this script prints what it is to read.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const option = name => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : undefined);
const required = name => option(name) ?? (process.stderr.write(`--${name} is required\n`), process.exit(2));

const project = resolve(required('project'));
const ref = required('ref');
const base = required('base');
const kit = resolve(required('kit'));
const yaml = createRequire(join(project, 'package.json'))('js-yaml');
const backlog = yaml.load(readFileSync(join(kit, 'backlog/backlog.yaml'), 'utf8')).features;

const git = (cwd, ...gitArgs) => execFileSync('git', gitArgs, { cwd, encoding: 'utf8' }).trim();
const env = { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', CI: '1' };
const sh = (command, cwd, timeout = 600_000) => {
  const result = spawnSync('sh', ['-c', command], { cwd, env, encoding: 'utf8', timeout, maxBuffer: 64 * 1024 * 1024 });
  return { code: result.status ?? 1, out: `${result.stdout ?? ''}${result.stderr ?? ''}` };
};
const parse = text => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

const commit = git(project, 'rev-parse', ref);
const tree = join(`${project}.flow`, 'grade', commit.slice(0, 12));
if (existsSync(tree)) {
  git(project, 'worktree', 'remove', '--force', tree);
}
mkdirSync(join(`${project}.flow`, 'grade'), { recursive: true });
git(project, 'worktree', 'add', '-q', '--detach', tree, commit);
// The dependencies of the tree graded: the created ones, or, when a run added some, its own.
const manifests = ['package.json', 'yarn.lock'];
const sameDependencies = manifests.every(
  file => sh(`git diff --quiet ${base} ${commit} -- ${file}`, project).code === 0,
);
if (sameDependencies) execFileSync('cp', ['-al', join(project, 'node_modules'), join(tree, 'node_modules')]);
else {
  execFileSync('cp', ['-a', join(project, 'node_modules'), join(tree, 'node_modules')]);
  const installed = sh('yarn install --silent', tree, 600_000);
  if (installed.code !== 0) process.stderr.write(`yarn install failed in ${tree}:\n${installed.out.slice(-2000)}\n`);
}

const acceptanceDir = join(tree, 'src/Bootstrap/Fastify/Acceptance');
mkdirSync(acceptanceDir, { recursive: true });
for (const file of readdirSync(join(kit, 'acceptance')))
  copyFileSync(join(kit, 'acceptance', file), join(acceptanceDir, file));
const started = Date.now();
const gate = parse(sh(`yarn -s architecture gate --base ${base} --mode architecture --json`, tree).out);
// The kit's storms, held as done: then whatever the code does not carry is a difference.
const stormsDir = join(`${project}.flow`, 'grade', `${commit.slice(0, 12)}.storms`);
mkdirSync(stormsDir, { recursive: true });
// A later feature may change a command an earlier one brought (feature 7 has archiving cancel a
// reminder): each storm is held to the code as the backlog leaves it, the later storm's shape of a
// command taking the place of the earlier one's.
const storms = backlog.map(f => yaml.load(readFileSync(join(kit, 'storms', `${f.id}.yaml`), 'utf8')));
storms.forEach((storm, index) => {
  for (const context of storm.contexts) {
    context.commands = context.commands.map(command => {
      for (const later of storms.slice(index + 1)) {
        const same = later.contexts
          .find(each => each.id === context.id)
          ?.commands.find(each => each.name === command.name);
        if (same) command = same;
      }
      return command;
    });
    context.events = [...new Set([...context.events, ...context.commands.flatMap(command => command.events)])].sort();
  }
  writeFileSync(join(stormsDir, `${backlog[index].id}.yaml`), yaml.dump({ ...storm, done: true }));
});
const m1 = {
  verdict: gate?.verdict ?? 'unreadable',
  failing: (gate?.steps ?? [])
    .filter(step => step.status === 'fail')
    .map(step => ({ name: step.name, lines: (step.lines ?? []).slice(0, 30) })),
};

const features = backlog.map(f => {
  const file = `${f.n}-${f.id}.acceptance.ts`;
  const run = sh(`yarn -s test --testMatch '**/Acceptance/${file}'`, tree, 300_000);
  const tests = run.out.match(/Tests:\s+(.*)/)?.[1] ?? 'did not report';
  const failed = [...run.out.matchAll(/^\s+● (.+)$/gm)]
    .map(match => match[1])
    .filter(name => name !== 'Test suite failed to run');
  const storm = parse(
    sh(`yarn -s architecture storm --expect ${join(stormsDir, `${f.id}.yaml`)} --json`, tree, 300_000).out,
  );
  const owed = storm?.problems ?? ['the storm could not be read'];
  return {
    feature: f.id,
    M2: { pass: run.code === 0, tests, failed },
    M3: { pass: owed.length === 0, owed },
  };
});

const report = {
  schemaVersion: 1,
  project,
  ref,
  commit,
  base,
  M1: m1,
  features: features.map(each => ({ ...each, mechanical: m1.verdict === 'pass' && each.M2.pass && each.M3.pass })),
  gradedInMs: Date.now() - started,
};
const out = option('out');
if (out) writeFileSync(resolve(out), `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(
  `M1 gate: ${m1.verdict}${m1.failing.length ? ` (${m1.failing.map(step => step.name).join(', ')})` : ''}\n`,
);
for (const each of report.features) {
  process.stdout.write(
    `${each.mechanical ? '✓' : '✗'} ${each.feature}: acceptance ${each.M2.pass ? 'pass' : `FAIL (${each.M2.failed.length} failed)`} · storm ${each.M3.pass ? 'carried' : `owes ${each.M3.owed.length}`}\n`,
  );
}
process.stdout.write(`\nThe tree graded: ${tree} — read it for the rubric's R items.\n`);
rmSync(stormsDir, { recursive: true, force: true });
