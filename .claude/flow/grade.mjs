#!/usr/bin/env node
/**
 * The mechanical half of the benchmark's rubric (docs/evaluations/benchmark/rubric.md), on one
 * run's final tree, whatever the arm:
 *
 *   node .claude/flow/grade.mjs --project <dir> --ref <ref> --base <created commit> --kit <dir> [--tooling <clean-ddd.tgz>] [--out <file.json>]
 *                               [--control plain|prose]
 *
 * In a worktree of its own at `ref`, it copies the kit's acceptance tests beside their support
 * into `src/Bootstrap/Fastify/Acceptance/`, then runs:
 *   M1  the gate on the whole run, from the created commit, in the architecture mode;
 *   M2  each feature's acceptance test, on its own;
 *   M3  each feature's storm, from the kit, against the code: what it still owes.
 * The read half (R) is the grader's, with evidence; this script prints what it is to read.
 *
 * A control arm (docs/evaluations/benchmark/control) has no gate and no storm: M1 is the project's
 * own `yarn check`, M3 is not graded, and M2 is the same acceptance tests — beside a support that
 * starts `src/app.ts` in a plain project. For the prose arm, the import rules the architecture's
 * tooling would have generated are run afterwards, every context the tree grew declared, and their
 * refusals counted: what the architecture became with nothing to hold it.
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

const cli = resolve(new URL('../../tools/dist/cli.js', import.meta.url).pathname);
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

// Every arm graded by the same tooling: the package given, in place of whichever the tree installed.
const tooling = option('tooling');
if (tooling) {
  const target = join(tree, 'node_modules/clean-ddd');
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  execFileSync('tar', ['-xzf', resolve(tooling), '-C', target, '--strip-components=1']);
}

const control = option('control');
// A control arm's own checks, on the tree as the run left it, before the hidden tests are added.
const checks = control ? sh('yarn -s check', tree, 900_000) : undefined;
const acceptanceDir = join(tree, control === 'plain' ? 'src/acceptance' : 'src/Bootstrap/Fastify/Acceptance');
mkdirSync(acceptanceDir, { recursive: true });
for (const file of readdirSync(join(kit, 'acceptance')))
  copyFileSync(join(kit, 'acceptance', file), join(acceptanceDir, file));
if (control === 'plain') {
  // The same client, starting the plain project's application.
  const support = join(acceptanceDir, 'support.ts');
  writeFileSync(
    support,
    readFileSync(support, 'utf8')
      .replace(
        /^import \{ FastifyApplication \} from .*\n/m,
        "import type { Application as FastifyApplication } from '../app';\n",
      )
      .replace(/^import \{ createApplication \} from .*\n/m, "import { createApplication } from '../app';\n"),
  );
}
const started = Date.now();
const gate = control
  ? {
      verdict: checks.code === 0 ? 'pass' : 'fail',
      steps: [
        { name: 'yarn check', status: checks.code === 0 ? 'pass' : 'fail', lines: checks.out.split('\n').slice(-30) },
      ],
    }
  : parse(sh(`yarn -s architecture gate --base ${base} --mode architecture --json`, tree).out);
// The kit's storms, held as done: then whatever the code does not carry is a difference.
const stormsDir = join(`${project}.flow`, 'grade', `${commit.slice(0, 12)}.storms`);
mkdirSync(stormsDir, { recursive: true });
// The kit's storms held as done, by this repository's tooling for every arm: a storm is carried
// when the code records at least what it said (a later feature may add a fact to a command).
for (const f of backlog) {
  const text = readFileSync(join(kit, 'storms', `${f.id}.yaml`), 'utf8').replace(/^done: false$/m, 'done: true');
  writeFileSync(join(stormsDir, `${f.id}.yaml`), text);
}
const m1 = {
  verdict: gate?.verdict ?? 'unreadable',
  failing: (gate?.steps ?? [])
    .filter(step => step.status === 'fail')
    .map(step => ({ name: step.name, lines: (step.lines ?? []).slice(0, 30) })),
};

const features = backlog.map(f => {
  const file = `${f.n}-${f.id}.acceptance.ts`;
  const run = sh(
    `yarn -s test --testMatch '**/${control === 'plain' ? 'acceptance' : 'Acceptance'}/${file}'`,
    tree,
    300_000,
  );
  const tests = run.out.match(/Tests:\s+(.*)/)?.[1] ?? 'did not report';
  const failed = [...run.out.matchAll(/^\s+● (.+)$/gm)]
    .map(match => match[1])
    .filter(name => name !== 'Test suite failed to run');
  const storm = control
    ? { problems: [] }
    : parse(sh(`node ${cli} storm --expect ${join(stormsDir, `${f.id}.yaml`)} --json`, tree, 300_000).out);
  const owed = storm?.problems ?? ['the storm could not be read'];
  return {
    feature: f.id,
    M2: { pass: run.code === 0, tests, failed },
    M3: { pass: owed.length === 0, owed },
  };
});

// The prose arm: the import rules the tooling would have generated, held to the tree afterwards.
let drift;
if (control === 'prose') {
  const created = join(`${project}.flow`, 'grade', 'created');
  rmSync(created, { recursive: true, force: true });
  execFileSync(process.execPath, [cli, 'create', created, '--name', 'drift'], { encoding: 'utf8', stdio: 'pipe' });
  rmSync(join(tree, 'conventions'), { recursive: true, force: true });
  execFileSync('cp', ['-a', join(created, 'conventions'), join(tree, 'conventions')]);
  copyFileSync(join(created, 'eslint.config.js'), join(tree, 'eslint.config.js'));
  const yamlDir = join(tree, 'node_modules/js-yaml');
  if (!existsSync(yamlDir))
    execFileSync('cp', ['-a', resolve(new URL('../../node_modules/js-yaml', import.meta.url).pathname), yamlDir]);
  const contexts = readdirSync(join(tree, 'src/Contexts'), { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name);
  const binding = join(tree, 'conventions/typescript.yaml');
  writeFileSync(
    binding,
    readFileSync(binding, 'utf8').replace(/^contexts:.*(\n\s+-.*)*$/m, `contexts: [${contexts.join(', ')}]`),
  );
  const linted = parse(sh('npx eslint src --format json', tree, 600_000).out) ?? [];
  const refusals = linted.flatMap(file =>
    file.messages
      .filter(message => message.ruleId === 'no-restricted-imports')
      .map(message => ({
        file: file.filePath.replace(`${tree}/`, ''),
        line: message.line,
        message: message.message.split('\n')[0],
      })),
  );
  drift = {
    contexts,
    refusals: refusals.length,
    files: new Set(refusals.map(each => each.file)).size,
    sample: refusals.slice(0, 40),
  };
  rmSync(created, { recursive: true, force: true });
}

const report = {
  schemaVersion: 1,
  control: control ?? null,
  drift,
  project,
  ref,
  commit,
  base,
  M1: m1,
  features: features.map(each => ({
    ...each,
    mechanical: m1.verdict === 'pass' && each.M2.pass && (control ? true : each.M3.pass),
  })),
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
