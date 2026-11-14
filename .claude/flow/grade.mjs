#!/usr/bin/env node
/**
 * The mechanical half of the benchmark's rubric (docs/evaluations/benchmark/rubric.md), on one
 * run's final tree, whatever the arm:
 *
 *   node .claude/flow/grade.mjs --project <dir> --ref <ref> --base <created commit> --kit <dir> [--tooling <clean-ddd.tgz>] [--out <file.json>]
 *                               [--control plain|prose] [--upto <n>] [--only <id,id>] [--keep false] [--gate false]
 *                               [--workers <n>] [--previous <id>=<ref>,…]
 *
 * `--upto <n>` grades the features numbered up to n only: the feature an attempt wrote and the
 * ones before it, for regressions (OpenStay's ladder, run-ladder.mjs). `--only <ids>` grades
 * those features alone, as the ladder replays a failure before it escalates. `--keep false` removes the
 * graded worktree afterwards, so that no agent working beside it can read the hidden tests. `--gate false` skips M1
 * (reported `skipped`): the ladder decides on M2 alone and has just run the same gate as its verdict, so M1 there
 * is the same work twice (OpenStay J5b: eight to ten minutes an attempt on the larger tree).
 *
 * In a worktree of its own at `ref`, it copies the kit's acceptance tests beside their support
 * into `src/Bootstrap/Fastify/Acceptance/`, then runs:
 *   M1  the gate on the whole run, from the created commit, in the architecture mode;
 *   M2  each feature's acceptance test, on its own;
 *   M3  each feature's storm, from the kit, against the code: what it still owes.
 * The read half (R) is the grader's, with evidence; this script prints what it is to read.
 *
 * With `--workers <n>` (more than one), M2 runs every feature's acceptance test in one jest, n files at a time, instead
 * of one jest per file (the test files are apart: each takes a free port and databases of its own). A file that fails
 * there is run again alone, as without `--workers`, and that run is its verdict; the first is kept as `M2.together`.
 * So the grades are the sequential grader's, and only the time changes: one jest started once, rather than once per
 * feature, with up to n files at once. A tree's own `--detectOpenHandles`, which would run them one at a time, is left
 * out of that one run, and `--forceExit` ends it.
 *
 * A feature marked `upgrade: true` in the kit's backlog is a change to what a tree already stored: its test records
 * through the tree as it stood before that feature, then reads through the tree graded, on the same database.
 * `--previous <id>=<ref>` names that earlier tree for each such feature (the ladder passes the commit its
 * feature started from). The grader checks each one out beside the graded tree and tells the tests where, in
 * `ACCEPTANCE_PREVIOUS` (a JSON map from the feature's id to the directory); a feature with no `--previous` is
 * graded with the graded tree in both places, and its report says so (`previous: null`), since that half of its test
 * then holds nothing.
 *
 * A kit that carries its requests' API (`api/`) also gets the API composed up to `--upto`, as
 * `api-schema.json` beside the tests, and its path in `API_SCHEMA` when they run (api-schema.mjs).
 *
 * A control arm (docs/evaluations/benchmark/control) has no gate and no storm: M1 is the project's
 * own `yarn verify`, M3 is not graded, and M2 is the same acceptance tests — beside a support that
 * starts `src/app.ts` in a plain project. For the prose arm, the import rules the architecture's
 * tooling would have generated are run afterwards, every context the tree grew declared, and their
 * refusals counted: what the architecture became with nothing to hold it.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

import { shortTmpDir } from './machine.mjs';
import { provideDependencies } from './supervision.mjs';

const args = process.argv.slice(2);
const option = name => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : undefined);
const required = name => option(name) ?? (process.stderr.write(`--${name} is required\n`), process.exit(2));

const project = resolve(required('project'));
const ref = required('ref');
const base = required('base');
const kit = resolve(required('kit'));
const yaml = createRequire(join(project, 'package.json'))('js-yaml');
const upto = option('upto');
// `--only a,b`: those features alone, as the ladder replays a failure before it escalates.
const only = option('only')?.split(',');
const backlog = yaml
  .load(readFileSync(join(kit, 'backlog/backlog.yaml'), 'utf8'))
  .features.filter(f => upto === undefined || f.n <= Number(upto))
  .filter(f => only === undefined || only.includes(f.id));

// `--previous a=<ref>,b=<ref>`: the tree before each `upgrade` feature (above).
const previousRefs = new Map(
  (option('previous') ?? '')
    .split(',')
    .filter(Boolean)
    .map(pair => [pair.slice(0, pair.indexOf('=')), pair.slice(pair.indexOf('=') + 1)]),
);

const cli = resolve(new URL('../../tools/dist/cli.js', import.meta.url).pathname);
const git = (cwd, ...gitArgs) => execFileSync('git', gitArgs, { cwd, encoding: 'utf8' }).trim();
const env = { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', CI: '1' };
// A temporary directory of the project's own, as the ladder gives each run (jest's cache follows it): graded outside a
// ladder (a dry run), thirty files an attempt filled a shared /tmp with 13 GB of transforms (J6's kit, checkpoint 3).
// At a short path (machine.mjs, shortTmpDir), or no server starts. A ladder's own is kept.
if (!env.TMPDIR?.startsWith('/tmp/cdd-')) env.TMPDIR = shortTmpDir(`${project}/grade`);
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
// Linked when unchanged: grading runs no agent, and the tests it runs install nothing.
if (sameDependencies) provideDependencies(project, tree, 'link');
else {
  provideDependencies(project, tree, 'copy');
  const installed = sh('yarn install --silent', tree, 600_000);
  if (installed.code !== 0) process.stderr.write(`yarn install failed in ${tree}:\n${installed.out.slice(-2000)}\n`);
}

// The tree before each `upgrade` feature, checked out beside the graded one, with its dependencies: the graded
// tree's when the manifests are the same, the created ones when they are the created ones, its own otherwise.
const previousTrees = new Map();
for (const f of backlog.filter(each => each.upgrade && previousRefs.has(each.id))) {
  const before = git(project, 'rev-parse', previousRefs.get(f.id));
  const dir = join(`${project}.flow`, 'grade', `${commit.slice(0, 12)}.before-${f.n}`);
  if (existsSync(dir)) git(project, 'worktree', 'remove', '--force', dir);
  git(project, 'worktree', 'add', '-q', '--detach', dir, before);
  const same = from => manifests.every(file => sh(`git diff --quiet ${from} ${before} -- ${file}`, project).code === 0);
  if (same(commit)) provideDependencies(tree, dir, 'link');
  else if (same(base)) provideDependencies(project, dir, 'link');
  else {
    provideDependencies(project, dir, 'copy');
    const installed = sh('yarn install --silent', dir, 600_000);
    if (installed.code !== 0) process.stderr.write(`yarn install failed in ${dir}:\n${installed.out.slice(-2000)}\n`);
  }
  previousTrees.set(f.id, { ref: before, dir });
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
const withGate = option('gate') !== 'false';
const checks = control && withGate ? sh('yarn -s verify', tree, 900_000) : undefined;
const acceptanceDir = join(tree, control === 'plain' ? 'src/acceptance' : 'src/Bootstrap/Fastify/Acceptance');
mkdirSync(acceptanceDir, { recursive: true });
for (const file of readdirSync(join(kit, 'acceptance')))
  copyFileSync(join(kit, 'acceptance', file), join(acceptanceDir, file));
const support = join(acceptanceDir, 'support.ts');
if (control === 'plain' && existsSync(support)) {
  // The same client, starting the plain project's application.
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
// A kit that carries its requests' API (api/, docs/evaluations/benchmark/kit-standard.md): the API up to
// --upto, beside the tests, which validate every answer they read against it (API_SCHEMA). A kit
// without api/ writes nothing and runs as before.
let apiSchema;
if (existsSync(join(kit, 'api'))) {
  const { writeComposed } = await import('./api-schema.mjs');
  apiSchema = writeComposed(kit, upto, join(acceptanceDir, 'api-schema.json'));
  // In the tree's own format, so that its format check reads it as it reads the tests.
  sh(`npx --no-install prettier --write ${apiSchema}`, tree);
}
const started = Date.now();
const gate = !withGate
  ? { verdict: 'skipped', steps: [] }
  : control
    ? {
        verdict: checks.code === 0 ? 'pass' : 'fail',
        steps: [
          {
            name: 'yarn verify',
            status: checks.code === 0 ? 'pass' : 'fail',
            lines: checks.out.split('\n').slice(-30),
          },
        ],
      }
    : parse(sh(`yarn -s architecture gate --base ${base} --mode architecture --json`, tree).out);
// The kit's storms, held as done: then whatever the code does not carry is a difference.
const stormsDir = join(`${project}.flow`, 'grade', `${commit.slice(0, 12)}.storms`);
mkdirSync(stormsDir, { recursive: true });
// The kit's storms held as done, by this repository's tooling for every arm: a storm is carried
// when the code records at least what it said (a later feature may add a fact to a command).
// A feature with no storm (one that adds no command, event or policy) has nothing to hold there.
const stormed = f => existsSync(join(kit, 'storms', `${f.id}.yaml`));
for (const f of backlog.filter(stormed)) {
  const text = readFileSync(join(kit, 'storms', `${f.id}.yaml`), 'utf8').replace(/^done: false$/m, 'done: true');
  writeFileSync(join(stormsDir, `${f.id}.yaml`), text);
}
const m1 = {
  verdict: gate?.verdict ?? 'unreadable',
  failing: (gate?.steps ?? [])
    .filter(step => step.status === 'fail')
    .map(step => ({ name: step.name, lines: (step.lines ?? []).slice(0, 30) })),
};

/**
 * The hidden tests compute dates from today, and a file with crashes in it runs for minutes: a file
 * never starts in the last ten minutes of a UTC day, it waits for the next one. A run of every file
 * at once (`--workers`) keeps `margin` of the day instead.
 */
const awayFromMidnight = (margin = 600_000) => {
  const now = new Date();
  const left = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - now.getTime();
  if (left < margin) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, left + 5000);
};

const workers = Number(option('workers') ?? 1);
if (!Number.isInteger(workers) || workers < 1) {
  process.stderr.write('--workers is a whole number, 1 or more\n');
  process.exit(2);
}
const testsDir = control === 'plain' ? 'acceptance' : 'Acceptance';
const fileOf = f => `${f.n}-${f.id}.acceptance.ts`;
// A test that starts the server as a process of its own (the persistence experiment) is told its entry point.
const previousEnv = previousTrees.size
  ? `ACCEPTANCE_PREVIOUS='${JSON.stringify(Object.fromEntries([...previousTrees].map(([id, each]) => [id, each.dir])))}' `
  : '';
const testEnv = `${apiSchema ? `API_SCHEMA=${apiSchema} ` : ''}${previousEnv}ACCEPTANCE_ENTRY=${control === 'plain' ? 'src/server.ts' : 'src/Bootstrap/Fastify/application.ts'}`;
// What a failure said, kept with the verdict: an assertion and a timeout under load read alike
// in a list of names, and an escalation is checked against the kit before it is counted.
const SAID = /●|Expected|Received|Exceeded timeout|thrown|Error:|did not exit|Tests:/;

/** One feature's acceptance test, alone, in a jest of its own. */
const alone = file => {
  awayFromMidnight();
  const run = sh(`${testEnv} yarn -s test --testMatch '**/${testsDir}/${file}'`, tree, 300_000);
  const failed = [...run.out.matchAll(/^\s+● (.+)$/gm)]
    .map(match => match[1])
    .filter(name => name !== 'Test suite failed to run');
  return {
    pass: run.code === 0,
    tests: run.out.match(/Tests:\s+(.*)/)?.[1] ?? 'did not report',
    failed,
    ...(run.code !== 0 && {
      exitCode: run.code,
      said: run.out
        .split('\n')
        .filter(line => SAID.test(line))
        .slice(0, 60),
    }),
  };
};

/**
 * Every feature's acceptance test in one jest, `workers` files at a time (`--workers`): a map from each file to its
 * result, as `alone` answers it. A file the run did not report is absent, and is run alone.
 */
const together = files => {
  const script = parse(readFileSync(join(tree, 'package.json'), 'utf8'))?.scripts?.test ?? '';
  if (!/\bjest\b/.test(script)) return new Map();
  const jest = script.replace(/\s--detectOpenHandles\b/g, '').replace(/\s(--runInBand|-i)\b/g, '');
  const out = join(`${project}.flow`, 'grade', `${commit.slice(0, 12)}.together.json`);
  rmSync(out, { force: true });
  awayFromMidnight(Math.max(600_000, (files.length * 60_000) / workers));
  sh(
    `PATH="$PWD/node_modules/.bin:$PATH" ${testEnv} ${jest} --testMatch ${files.map(file => `'**/${testsDir}/${file}'`).join(' ')} --maxWorkers=${workers} --forceExit --json --outputFile=${out}`,
    tree,
    300_000 * Math.ceil(files.length / workers) + 120_000,
  );
  const report = existsSync(out) ? parse(readFileSync(out, 'utf8')) : undefined;
  rmSync(out, { force: true });
  const plain = text => String(text ?? '').replace(/\u001b\[[0-9;]*m/g, '');
  return new Map(
    (report?.testResults ?? []).map(result => {
      const assertions = result.assertionResults ?? [];
      const failed = assertions
        .filter(each => each.status === 'failed')
        .map(each => [...(each.ancestorTitles ?? []), each.title].join(' › '));
      const passed = assertions.filter(each => each.status === 'passed').length;
      const pass = result.status === 'passed';
      return [
        result.name.split('/').pop(),
        {
          pass,
          tests: assertions.length
            ? [failed.length && `${failed.length} failed`, passed && `${passed} passed`, `${assertions.length} total`]
                .filter(Boolean)
                .join(', ')
            : 'did not report',
          failed,
          ...(!pass && {
            said: plain(result.message)
              .split('\n')
              .filter(line => SAID.test(line))
              .slice(0, 60),
          }),
        },
      ];
    }),
  );
};

const first = workers > 1 && backlog.length > 1 ? together(backlog.map(fileOf)) : new Map();
const features = backlog.map(f => {
  const file = fileOf(f);
  const once = first.get(file);
  // A file that failed beside the others is run again alone: that run is its verdict, as without --workers.
  const run = once?.pass ? once : alone(file);
  const { pass, tests, failed, exitCode, said } = run;
  const storm =
    control || !stormed(f)
      ? { problems: [] }
      : parse(sh(`node ${cli} storm --expect ${join(stormsDir, `${f.id}.yaml`)} --json`, tree, 300_000).out);
  const owed = storm?.problems ?? ['the storm could not be read'];
  return {
    feature: f.id,
    M2: {
      pass,
      tests,
      failed,
      ...(!pass && { exitCode, said }),
      ...(once && !once.pass && { together: { failed: once.failed, tests: once.tests } }),
    },
    M3: { pass: owed.length === 0, owed },
    ...(f.upgrade && { previous: previousTrees.get(f.id)?.ref ?? null }),
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
  // The generated config, loading js-yaml whichever module format the copy below has.
  writeFileSync(
    join(tree, 'eslint.config.js'),
    readFileSync(join(created, 'eslint.config.js'), 'utf8').replace(
      "import { load } from 'js-yaml';",
      "import yaml from 'js-yaml';\nconst { load } = yaml;",
    ),
  );
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
  const eslint = sh('npx eslint src --format json', tree, 600_000);
  const linted = parse(eslint.out.slice(eslint.out.indexOf('[')));
  // A linter that did not run is not a tree with no refusals.
  if (!Array.isArray(linted)) throw new Error(`the generated import rules did not run:\n${eslint.out.slice(0, 2000)}`);
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
  workers,
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
rmSync(stormsDir, { recursive: true, force: true });
for (const { dir } of previousTrees.values()) git(project, 'worktree', 'remove', '--force', dir);
if (option('keep') === 'false') git(project, 'worktree', 'remove', '--force', tree);
else process.stdout.write(`\nThe tree graded: ${tree} — read it for the rubric's R items.\n`);
