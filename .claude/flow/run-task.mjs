#!/usr/bin/env node
/**
 * One run of one K4 task in one arm (RFC 0006 §8; the pilot registered in docs/evaluations/knowledge/k4-pilot: its
 * README.md is the protocol, plan.yaml the runs), from the preparation of the arm's tree to one JSON record.
 *
 *   node .claude/flow/run-task.mjs --id k4-t1-B-r1 | --order 1 | --all   [--dry [--show-prompt]]
 *        [--plan <plan.yaml>] [--work <dir>] [--out <dir>] [--openstay <repo>] [--modules <node_modules>]
 *        [--k3 <K3 package .tgz>] [--port 4471] [--no-judge] [--keep]
 *        [--stand-in <patch>|none] [--stand-in-answer <file>]                         # no agent: the proofs
 *   node .claude/flow/run-task.mjs --services start|stop|remove [--work <dir>]
 *
 * A run, in the order of plan.yaml's `launch`:
 *   1. **The services**: the plan's two PostgreSQL 16 clusters, the agent's and the grading's, each of its own under
 *      `<work>/pg/`, started if they are not (never shared: a tree's test run drops every `openstay_test_` database
 *      of its server).
 *   2. **The arm's tree**: `prepare-arm.sh <arm> <task> <openstay> <work>/runs/<nn>/openstay <node_modules> [<k3>]`, a
 *      repository of its own for each run (the runs of one task and arm share no branch, no worktree and no Claude
 *      Code project directory). Its path names neither the pilot nor the arm, and no directory above it holds a
 *      CLAUDE.md or a `.claude/`: the run refuses to start otherwise.
 *   3. **The agent**: the `claude-cli` runner (runners.mjs) in that tree, with the plan's prompt and the task's
 *      `task.md` verbatim inside it (C's sentence after it in C only), `claude-haiku-5-5`, the arm's tools (`--tools`
 *      and `--allowedTools`: Bash Read Edit Write Glob Grep, and Skill in B and C), `--setting-sources project
 *      --strict-mcp-config`, `--disable-slash-commands` in A, `--session-id`, `--max-budget-usd` and the time limit
 *      (stopped by process group). PATH has K3's `clean-ddd` first in C, then Node 24; the agent's database is the
 *      agent cluster. The run is refused when what the records already spent and this run's budget would pass the
 *      pilot's.
 *   4. **The log and the transcript**: the session file (`~/.claude/projects/…/<session>.jsonl`) copied to
 *      `<out>/transcripts/<attempt>.jsonl`; the measures (k4-measures.mjs); the leakage scan — a run whose tool
 *      inputs touched a kit, the hidden tests, OpenStay's repository, a J5b directory, the K3 package's source or the
 *      records is **void**, recorded so, and run again under the next attempt id (`<id>.2`, `<id>.3`).
 *   5. **The grading** (tasks 1, 2, 3, 5, 6), in the task's grading repository (`prepare-arm.sh B`, once a task,
 *      `<work>/grading/<task>/openstay`): the run's diff (start..head, committed work only) applied with `--3way`
 *      and committed; the tree's own checks there (`format:check`, `lint`, `typecheck`, `test:units`, `test:e2e`;
 *      `check:conventions` recorded apart); then `grade.mjs --upto 101 --workers 2 --gate false --keep false` on the
 *      task's kit (`<work>/kits/<task>`: J5's backlog, acceptance and storms, the task added as request 101 with its
 *      hidden test as `acceptance/101-<task id>.acceptance.ts`). The start is graded the same way once a task
 *      (`<work>/baselines/`), and a regression is a J5 file that passes there and fails on the result; a result
 *      whose tree is the start's is the baseline's grading. **Success**: the hidden test passes, the five checks pass,
 *      no regression.
 *      **Task 4**: the answer (the YAML block of the final message) scored against the ground truth's `expected`
 *      (k4-score.mjs), nothing in the tree changed, the rules matched by the judge (`--no-judge` leaves it to the
 *      operator); success is a pooled F1 of 0.6 or more.
 *   6. **The record**: `<out>/records/<attempt>.json`, and one `run` event in `<out>/k4-pilot.jsonl`. A run with a
 *      record that is not void is never run again; one whose agent finished before the driver died is graded on
 *      resume, from `<out>/state/<attempt>.agent.json`, without starting the agent again. The run's repository is kept
 *      as a bundle (`<out>/bundles/<attempt>.bundle`) and its directory removed (`--keep` keeps it).
 *
 * `--dry` prints what each run would do, checks its inputs, and runs nothing. `--stand-in <patch>` (or `none`) and
 * `--stand-in-answer <file>` replace the agent with a patch committed in the tree, or a final message, to prove the
 * preparation, the grading and the scoring without paying for an agent: such a record says `standIn`, has no
 * transcript and no measures, and belongs in a scratch `--out`, never in the pilot's.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  appendFileSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { loadGroundTruth, measure, readTranscript, toolCalls } from './k4-measures.mjs';
import { judgePrompt, parseAnswer, readJudgement, scoreAnswer } from './k4-score.mjs';
import { claudeCliArguments, runners } from './runners.mjs';
import { shortTmpDir } from './machine.mjs';
import { freePort, provideDependencies } from './supervision.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const REPOSITORY = resolve(here, '../..');
export const PILOT = join(REPOSITORY, 'docs/evaluations/knowledge/k4-pilot');
export const J5_KIT = join(REPOSITORY, 'docs/evaluations/benchmark/openstay/j5');
const yaml = createRequire(join(REPOSITORY, 'package.json'))('js-yaml');

export const BASE_TOOLS = ['Bash', 'Read', 'Edit', 'Write', 'Glob', 'Grep'];
export const JUDGE_MODEL = 'claude-sonnet-5-5';
export const CHECKS = ['format:check', 'lint', 'typecheck', 'test:units', 'test:e2e'];
export const APART = ['check:conventions'];
export const IMPACT_TASK = '4-review-window-impact';
const MAX_ATTEMPTS = 3;

// ---------------------------------------------------------------------------------------------------------------
// The plan, as data.

export function loadPlan(file = join(PILOT, 'plan.yaml')) {
  return yaml.load(readFileSync(file, 'utf8'));
}

/** The task's number, from its directory name (`1-cancelled-stay-hides-contacts` → 1). */
export const taskNumber = task => Number(String(task).split('-')[0]);
/** The task's id in the kit: request 101's (`k4-1-cancelled-stay-hides-contacts`). */
export const kitFeatureId = task => `k4-${task}`;

/** The prompt of a run: the plan's, the task verbatim in it, C's sentence after it in C only. */
export function composePrompt(plan, taskText, arm, port) {
  const prompt = plan.prompt.replace('{task}', taskText.trimEnd()).replace('{port}', String(port)).trimEnd();
  return arm === 'C' ? `${prompt}\n\n${plan.prompt_c.trimEnd()}` : prompt;
}

/** The arm's tools and the CLI's settings (README, "The agent, in every arm"). */
export function armSettings(plan, arm, sessionId) {
  const tools = [...(plan.per_run?.tools ?? BASE_TOOLS), ...(arm === 'A' ? [] : ['Skill'])];
  return {
    tools,
    extraArgs: [
      '--tools',
      tools.join(','),
      '--session-id',
      sessionId,
      '--setting-sources',
      'project',
      '--strict-mcp-config',
      ...(arm === 'A' ? ['--disable-slash-commands'] : []),
    ],
  };
}

/** The tokens a run used, as the runner reports them: input, output, cache read and cache creation, every model. */
export function tokensOf(modelUsage) {
  if (!modelUsage || typeof modelUsage !== 'object') return undefined;
  return Object.values(modelUsage).reduce(
    (sum, usage) =>
      sum +
      (usage.inputTokens ?? 0) +
      (usage.outputTokens ?? 0) +
      (usage.cacheReadInputTokens ?? 0) +
      (usage.cacheCreationInputTokens ?? 0),
    0,
  );
}

/** The kit's backlog for a task: J5's, and the task as request 101. */
export function kitBacklog(j5Backlog, task) {
  return {
    ...j5Backlog,
    features: [...j5Backlog.features, { id: kitFeatureId(task), n: 101, contexts: [], needs: [], kind: 'k4' }],
  };
}

/** Composes the task's kit in `dir` (J5's backlog, acceptance, storms and api when there is one; the task as 101). */
export function composeKit({ j5 = J5_KIT, taskDir, task, dir }) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, 'backlog'), { recursive: true });
  const backlog = yaml.load(readFileSync(join(j5, 'backlog/backlog.yaml'), 'utf8'));
  writeFileSync(
    join(dir, 'backlog/backlog.yaml'),
    `# J5's backlog (docs/evaluations/benchmark/openstay/j5), and K4's task ${task} as request 101.\n${yaml.dump(kitBacklog(backlog, task), { flowLevel: 2, lineWidth: 200 })}`,
  );
  for (const sub of ['acceptance', 'storms', 'api'])
    if (existsSync(join(j5, sub))) cpSync(join(j5, sub), join(dir, sub), { recursive: true });
  const hidden = readdirSync(join(taskDir, 'acceptance')).filter(name => name.endsWith('.acceptance.ts'));
  if (hidden.length !== 1) throw new Error(`${taskDir}/acceptance holds ${hidden.length} hidden tests, not one`);
  copyFileSync(
    join(taskDir, 'acceptance', hidden[0]),
    join(dir, 'acceptance', `101-${kitFeatureId(task)}.acceptance.ts`),
  );
  return dir;
}

/** The records of a plan run, by attempt: `<id>.json`, `<id>.2.json`, … */
export function attemptsOf(recordsDir, id) {
  if (!existsSync(recordsDir)) return [];
  return readdirSync(recordsDir)
    .map(name => new RegExp(`^${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\.(\\d+))?\\.json$`).exec(name))
    .filter(Boolean)
    .map(match => ({ attempt: Number(match[1] ?? 1), file: join(recordsDir, match[0]) }))
    .sort((a, b) => a.attempt - b.attempt)
    .map(each => ({ ...each, record: JSON.parse(readFileSync(each.file, 'utf8')) }));
}
export const attemptId = (id, attempt) => (attempt === 1 ? id : `${id}.${attempt}`);

/** What a run is now: `recorded` (a record that is not void), `pending` (with the attempt to run), or `exhausted`. */
export function runStatus(recordsDir, id) {
  const attempts = attemptsOf(recordsDir, id);
  const kept = attempts.find(each => !each.record.void);
  if (kept) return { status: 'recorded', attempt: kept.attempt, record: kept.record, voided: attempts.length - 1 };
  const next = attempts.length + 1;
  if (next > MAX_ATTEMPTS) return { status: 'exhausted', voided: attempts.length };
  return { status: 'pending', attempt: next, voided: attempts.length };
}

/** A code task's success: the hidden test, the five checks, no regression, and a diff that applied. */
export function codeSuccess({ applied, hidden, checks, regressions }) {
  return Boolean(
    applied?.pass && hidden?.pass && CHECKS.every(name => checks?.[name]?.pass) && regressions?.length === 0,
  );
}

/** The J5 files that pass on the start and fail on the result (the task's own request 101 is not one). */
export function regressionsOf(baselineFeatures, resultFeatures, own) {
  const before = new Map(baselineFeatures.map(each => [each.feature, each.M2.pass]));
  return resultFeatures
    .filter(each => each.feature !== own && before.get(each.feature) === true && !each.M2.pass)
    .map(each => each.feature);
}

/** The pilot's spending so far, from the records: the agents' cost and the judges'. */
export function spentUsd(recordsDir) {
  if (!existsSync(recordsDir)) return 0;
  return readdirSync(recordsDir)
    .filter(name => name.endsWith('.json'))
    .map(name => JSON.parse(readFileSync(join(recordsDir, name), 'utf8')))
    .reduce((sum, record) => sum + (record.agent?.costUsd ?? 0) + (record.score?.rules?.costUsd ?? 0), 0);
}

// ---------------------------------------------------------------------------------------------------------------
// The machine.

const sh = (command, args, { cwd, env, timeout = 3_600_000, input } = {}) => {
  const result = spawnSync(command, args, { cwd, env, encoding: 'utf8', timeout, maxBuffer: 256 * 1024 * 1024, input });
  return {
    code: result.status ?? 1,
    signal: result.signal,
    out: `${result.stdout ?? ''}${result.stderr ?? ''}`,
    stdout: result.stdout ?? '',
  };
};
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).trim();
const sha256 = text => createHash('sha256').update(text).digest('hex');
const tail = (text, count = 40) =>
  String(text ?? '')
    .split('\n')
    .filter(Boolean)
    .slice(-count);
const nodePath = (path = process.env.PATH ?? '') => `${dirname(process.execPath)}:${path}`;

const PG_BIN = process.env.K4_PG_BIN ?? '/usr/lib/postgresql/16/bin';
const asPostgres = (command, args) =>
  process.getuid?.() === 0 ? sh('runuser', ['-u', 'postgres', '--', command, ...args]) : sh(command, args);
const portOf = url => Number(new URL(url).port);

/** Starts the plan's cluster `name` (agent or grading), made on first use under `<work>/pg/<name>`. */
export function startCluster(work, name, url) {
  const dir = join(work, 'pg', name);
  const data = join(dir, 'data');
  const port = portOf(url);
  if (!existsSync(join(data, 'PG_VERSION'))) {
    const answering = sh(join(PG_BIN, 'pg_isready'), ['-q', '-h', '127.0.0.1', '-p', String(port)]);
    if (answering.code === 0)
      throw new Error(
        `port ${port} already answers, and not with the pilot's ${name} cluster: the clusters are never shared`,
      );
    mkdirSync(dir, { recursive: true });
    if (process.getuid?.() === 0) execFileSync('chown', ['postgres:postgres', dir]);
    const made = asPostgres(join(PG_BIN, 'initdb'), [
      '-D',
      data,
      '-U',
      'postgres',
      '-E',
      'UTF8',
      '--locale=C.UTF-8',
      '--auth=trust',
    ]);
    if (made.code !== 0) throw new Error(`initdb ${name}: ${made.out.slice(-1000)}`);
    const conf = [
      `port = ${port}`,
      "listen_addresses = '127.0.0.1'",
      `unix_socket_directories = '${dir}'`,
      'max_connections = 300',
      'shared_buffers = 256MB',
      'fsync = off',
      'synchronous_commit = off',
      'full_page_writes = off',
    ];
    appendFileSync(join(data, 'postgresql.conf'), `${conf.join('\n')}\n`);
  }
  if (asPostgres(join(PG_BIN, 'pg_ctl'), ['-D', data, 'status']).code !== 0) {
    const started = asPostgres(join(PG_BIN, 'pg_ctl'), [
      '-D',
      data,
      '-l',
      join(dir, 'server.log'),
      '-w',
      '-t',
      '60',
      'start',
    ]);
    if (started.code !== 0) throw new Error(`pg_ctl start ${name}: ${started.out.slice(-1000)}`);
  }
  if (sh(join(PG_BIN, 'pg_isready'), ['-q', '-h', '127.0.0.1', '-p', String(port)]).code !== 0)
    throw new Error(`the ${name} cluster does not answer on ${port}`);
  return { name, port, data };
}

export function stopCluster(work, name, { remove = false } = {}) {
  const dir = join(work, 'pg', name);
  const data = join(dir, 'data');
  if (existsSync(join(data, 'PG_VERSION')))
    asPostgres(join(PG_BIN, 'pg_ctl'), ['-D', data, '-m', 'fast', '-w', 'stop']);
  if (remove) rmSync(dir, { recursive: true, force: true });
}

/** A CLAUDE.md or a `.claude/` in a directory above the tree would reach the agent as project guidance. */
export function guidanceAbove(tree, home = homedir()) {
  const found = [];
  let dir = dirname(resolve(tree));
  for (;;) {
    for (const name of ['CLAUDE.md', 'CLAUDE.local.md', '.claude'])
      if (existsSync(join(dir, name)) && !(name === '.claude' && dir === home)) found.push(join(dir, name));
    const parent = dirname(dir);
    if (parent === dir) return found;
    dir = parent;
  }
}

const claudeConfigDir = () => process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude');
/** The session file of `sessionId`, wherever Claude Code put it under its projects. */
export function findTranscript(sessionId, config = claudeConfigDir()) {
  const projects = join(config, 'projects');
  if (!existsSync(projects)) return undefined;
  for (const project of readdirSync(projects)) {
    const file = join(projects, project, `${sessionId}.jsonl`);
    if (existsSync(file)) return file;
  }
  return undefined;
}

// ---------------------------------------------------------------------------------------------------------------
// One run.

function context(args) {
  const option = (name, fallback) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : fallback);
  const work = resolve(option('work', process.env.K4_WORK ?? '/var/tmp/k4-pilot'));
  const planFile = resolve(option('plan', join(PILOT, 'plan.yaml')));
  return {
    option,
    flag: name => args.includes(`--${name}`),
    planFile,
    pilotDir: dirname(planFile),
    plan: loadPlan(planFile),
    work,
    out: resolve(option('out', join(work, 'out'))),
    openstay: resolve(option('openstay', process.env.K4_OPENSTAY ?? '/home/user/openstay')),
    modules: resolve(option('modules', process.env.K4_MODULES ?? '/home/user/j5b/clean-3/app/node_modules')),
    k3: option('k3') ? resolve(option('k3')) : undefined,
    port: Number(option('port', '4471')),
  };
}

const paths = (ctx, run, attempt) => {
  const id = attemptId(run.id, attempt);
  const runDir = join(ctx.work, 'runs', `${String(run.order).padStart(2, '0')}${attempt > 1 ? `-${attempt}` : ''}`);
  return {
    id,
    runDir,
    tree: join(runDir, 'openstay'),
    taskDir: join(ctx.pilotDir, 'tasks', run.task),
    kit: join(ctx.work, 'kits', run.task),
    grading: join(ctx.work, 'grading', run.task, 'openstay'),
    baseline: join(ctx.work, 'baselines', `${run.task}.json`),
    record: join(ctx.out, 'records', `${id}.json`),
    state: join(ctx.out, 'state', `${id}.agent.json`),
    transcript: join(ctx.out, 'transcripts', `${id}.jsonl`),
    grade: join(ctx.out, 'grades', `${id}.json`),
    logs: join(ctx.out, 'logs'),
    log: join(ctx.out, 'k4-pilot.jsonl'),
  };
};

/** What the scan voids a run for, beyond the README's fixed patterns: the paths of this machine. */
const leakPaths = ctx => {
  // The J5b directory (…/j5b of …/j5b/clean-3/app/node_modules), only when it is one: never a parent as wide as a home.
  const j5b = dirname(dirname(dirname(ctx.modules)));
  return [
    ctx.openstay,
    /j5b/i.test(basename(j5b)) ? j5b : dirname(ctx.modules),
    join(ctx.work, 'kits'),
    join(ctx.work, 'grading'),
    join(ctx.work, 'baselines'),
    ctx.out,
    REPOSITORY,
  ];
};

/**
 * This machine's environment, less what names the driver: Claude Code's own markers, npm's, and any variable that holds
 * a path the agent must not be told (a PATH keeps its other entries).
 */
export function cleanEnvironment(env, hidden) {
  const clean = { ...env };
  for (const key of Object.keys(clean)) {
    if (key === 'PATH') continue;
    if (
      /^(CLAUDECODE|CLAUDE_CODE_ENTRYPOINT|CLAUDE_CODE_SSE_PORT|OLDPWD|INIT_CWD|K4_.*|npm_.*)$/.test(key) ||
      hidden.some(path => String(clean[key]).includes(path))
    )
      delete clean[key];
  }
  clean.PATH = String(env.PATH ?? '')
    .split(':')
    .filter(entry => entry && !hidden.some(path => entry.includes(path)))
    .join(':');
  return clean;
}

const event = (p, run, name, data = {}) => {
  mkdirSync(dirname(p.log), { recursive: true });
  appendFileSync(
    p.log,
    `${JSON.stringify({ pilot: 'k4-pilot', id: p.id, plan: run.id, event: name, at: new Date().toISOString(), ...data })}\n`,
  );
};

function prepareTree(ctx, arm, taskDir, out) {
  const args = [
    join(ctx.pilotDir, 'prepare-arm.sh'),
    arm,
    taskDir,
    ctx.openstay,
    out,
    ctx.modules,
    ...(arm === 'C' ? [ctx.k3] : []),
  ];
  const done = sh('bash', args, { env: { ...process.env, PATH: nodePath() } });
  if (done.code !== 0) throw new Error(`prepare-arm.sh ${arm} ${basename(taskDir)}: ${done.out.slice(-2000)}`);
  return done.out.trim();
}

/** The agent's environment: this machine's, less what names the driver, with the arm's PATH and the agent's database. */
function agentEnvironment(ctx, p, arm) {
  const env = cleanEnvironment(process.env, leakPaths(ctx));
  const k3bin = arm === 'C' ? `${p.tree}.k3/bin:` : '';
  return {
    ...env,
    PATH: `${k3bin}${nodePath(env.PATH)}`,
    PWD: p.tree,
    TMPDIR: shortTmpDir(p.runDir),
    TEST_DATABASE_URL: `${ctx.plan.database.agent}/postgres`,
    OPENSTAY_POSTGRES: ctx.plan.database.agent,
  };
}

const gradingEnvironment = ctx => ({
  ...process.env,
  PATH: nodePath(),
  TEST_DATABASE_URL: `${ctx.plan.database.grading}/postgres`,
  OPENSTAY_POSTGRES: ctx.plan.database.grading,
  YARN_IGNORE_ENGINES: 'true',
  CI: '1',
  FORCE_COLOR: '0',
  NO_COLOR: '1',
});

/** The tree's own checks on `commit` of the grading repository, in a worktree of their own. */
function ownChecks(ctx, grading, start, commit, label) {
  const dir = join(`${grading}.flow`, 'checks', label);
  if (existsSync(dir)) git(grading, 'worktree', 'remove', '--force', dir);
  mkdirSync(dirname(dir), { recursive: true });
  git(grading, 'worktree', 'add', '-q', '--detach', dir, commit);
  const env = { ...gradingEnvironment(ctx), TMPDIR: shortTmpDir(`${grading}/checks`) };
  const same = ['package.json', 'yarn.lock'].every(
    file => sh('git', ['diff', '--quiet', start, commit, '--', file], { cwd: grading }).code === 0,
  );
  let install;
  if (same) provideDependencies(grading, dir, 'link');
  else {
    provideDependencies(grading, dir, 'copy');
    const installed = sh('yarn', ['install', '--silent'], { cwd: dir, env, timeout: 900_000 });
    install = { pass: installed.code === 0, tail: tail(installed.out, 20) };
  }
  const checks = {};
  for (const name of [...CHECKS, ...APART]) {
    const started = Date.now();
    const done = sh('yarn', ['-s', name], { cwd: dir, env, timeout: 2_700_000 });
    checks[name] = {
      pass: done.code === 0,
      exitCode: done.code,
      ...(done.signal && { signal: done.signal }),
      ms: Date.now() - started,
      ...(/^test/.test(name) && { tests: done.out.match(/^Tests:\s+(.*)$/m)?.[1] ?? 'did not report' }),
      ...(done.code !== 0 && {
        failed: [...done.out.matchAll(/^\s+● (.+)$/gm)]
          .map(match => match[1])
          .filter(each => each !== 'Test suite failed to run')
          .slice(0, 100),
        tail: tail(done.out, 40),
      }),
    };
  }
  git(grading, 'worktree', 'remove', '--force', dir);
  return { ...(install && { install }), checks };
}

/** grade.mjs on `ref` of the grading repository, with the task's kit up to 101. */
function gradeKit(ctx, p, ref, start, out, logName) {
  mkdirSync(dirname(out), { recursive: true });
  mkdirSync(p.logs, { recursive: true });
  const args = [
    join(here, 'grade.mjs'),
    '--project',
    p.grading,
    '--ref',
    ref,
    '--base',
    start,
    '--kit',
    p.kit,
    '--upto',
    '101',
    '--workers',
    '2',
    '--gate',
    'false',
    '--keep',
    'false',
    '--out',
    out,
  ];
  const done = sh(process.execPath, args, { env: gradingEnvironment(ctx), timeout: 4 * 3_600_000 });
  writeFileSync(join(p.logs, `${logName}.grade.log`), done.out);
  if (!existsSync(out)) throw new Error(`grade.mjs wrote no report (exit ${done.code}): ${done.out.slice(-2000)}`);
  return {
    command: `node .claude/flow/grade.mjs ${args.slice(1).join(' ')}`,
    report: JSON.parse(readFileSync(out, 'utf8')),
  };
}

/** The task's grading repository, its kit and its baseline: made once a task. */
function gradingSetup(ctx, p, run) {
  if (!existsSync(p.grading)) prepareTree(ctx, 'B', p.taskDir, p.grading);
  if (!existsSync(join(p.kit, 'backlog/backlog.yaml'))) composeKit({ taskDir: p.taskDir, task: run.task, dir: p.kit });
  const start = git(p.grading, 'rev-parse', 'HEAD');
  if (run.task === IMPACT_TASK) return { start };
  if (existsSync(p.baseline)) {
    const baseline = JSON.parse(readFileSync(p.baseline, 'utf8'));
    if (baseline.start === start) return { start, baseline };
  }
  process.stdout.write(`${run.task}: grading the start once (${start.slice(0, 12)}), the regressions' baseline\n`);
  const own = ownChecks(ctx, p.grading, start, start, 'baseline');
  const graded = gradeKit(
    ctx,
    p,
    start,
    start,
    join(ctx.work, 'baselines', `${run.task}.grade.json`),
    `baseline-${run.task}`,
  );
  const baseline = {
    task: run.task,
    start,
    at: new Date().toISOString(),
    ...own,
    kit: graded.report.features.map(({ feature, M2 }) => ({
      feature,
      M2: { pass: M2.pass, tests: M2.tests, failed: M2.failed },
    })),
  };
  mkdirSync(dirname(p.baseline), { recursive: true });
  writeFileSync(p.baseline, `${JSON.stringify(baseline, null, 2)}\n`);
  return { start, baseline };
}

/** The run's committed diff, applied to the task's grading tree and committed: the commit graded. */
function applyRun(p, agentStart, agentHead, gradingStart) {
  const dir = join(`${p.grading}.flow`, 'apply', p.id);
  if (existsSync(dir)) git(p.grading, 'worktree', 'remove', '--force', dir);
  mkdirSync(dirname(dir), { recursive: true });
  git(p.grading, 'fetch', '-q', p.tree, `+HEAD:refs/k4/agent/${p.id}`);
  const patch = execFileSync('git', ['diff', '--binary', agentStart, agentHead], {
    cwd: p.tree,
    maxBuffer: 256 * 1024 * 1024,
  });
  git(p.grading, 'worktree', 'add', '-q', '--detach', dir, gradingStart);
  let applied = {
    pass: true,
    files: Number(git(p.tree, 'diff', '--name-only', agentStart, agentHead).split('\n').filter(Boolean).length),
  };
  if (patch.length) {
    const done = sh('git', ['apply', '--3way', '--index', '--whitespace=nowarn'], { cwd: dir, input: patch });
    if (done.code !== 0 || /conflict/i.test(done.out)) applied = { pass: false, said: tail(done.out, 30) };
  }
  let commit;
  if (applied.pass) {
    sh('git', ['add', '-A'], { cwd: dir });
    git(
      dir,
      '-c',
      'user.name=K4',
      '-c',
      'user.email=k4@example.invalid',
      'commit',
      '-q',
      '--allow-empty',
      '--no-verify',
      '-m',
      `K4 ${p.id}: the run's diff`,
    );
    commit = git(dir, 'rev-parse', 'HEAD');
    git(p.grading, 'branch', '-f', `graded/${p.id}`, commit);
  }
  git(p.grading, 'worktree', 'remove', '--force', dir);
  return { applied, commit };
}

async function judgeRules(ctx, p, answer, expected) {
  const dir = join(p.runDir, 'judge');
  mkdirSync(dir, { recursive: true });
  const result = await runners['claude-cli'].run({
    prompt: judgePrompt(answer.rules, expected.rules),
    cwd: dir,
    model: JUDGE_MODEL,
    env: (env => ({ ...env, PATH: nodePath(env.PATH) }))(cleanEnvironment(process.env, leakPaths(ctx))),
    timeoutMs: 600_000,
    maxBudgetUsd: 1,
    tools: [],
    extraArgs: ['--tools', '', '--setting-sources', 'project', '--strict-mcp-config', '--disable-slash-commands'],
  });
  const judged = readJudgement(result.report, answer.rules, expected.rules);
  return {
    judge: JUDGE_MODEL,
    costUsd: result.costUsd,
    ...(judged ?? { unreadable: tail(result.report, 20) }),
    operatorRead: false,
  };
}

/** Runs one attempt of one plan run, and writes its record. */
async function runAttempt(ctx, run, attempt, standIn) {
  const p = paths(ctx, run, attempt);
  const plan = ctx.plan;
  const { groundTruth, repaired } = loadGroundTruth(
    readFileSync(join(p.taskDir, 'ground-truth.yaml'), 'utf8'),
    yaml.load,
  );
  const startedAt = new Date().toISOString();

  // 1–3: the services, the tree, the agent — unless the agent already finished before a driver died.
  let agentState = existsSync(p.state) ? JSON.parse(readFileSync(p.state, 'utf8')) : undefined;
  startCluster(ctx.work, 'grading', plan.database.grading);
  if (!agentState) {
    startCluster(ctx.work, 'agent', plan.database.agent);
    if (existsSync(p.runDir)) {
      event(p, run, 'restarted', {
        why: 'a run directory without a finished agent: the driver died while the agent ran',
      });
      rmSync(p.runDir, { recursive: true, force: true });
    }
    mkdirSync(p.runDir, { recursive: true });
    const above = guidanceAbove(p.tree);
    if (above.length) throw new Error(`guidance above the agent's tree would reach it: ${above.join(', ')}`);
    const prepared = prepareTree(ctx, run.arm, p.taskDir, p.tree);
    const tree = realpathSync(p.tree);
    const start = git(tree, 'rev-parse', 'HEAD');
    const tracked = git(tree, 'ls-files').split('\n').filter(Boolean);
    const taskText = readFileSync(join(p.taskDir, 'task.md'), 'utf8');
    const prompt = composePrompt(plan, taskText, run.arm, ctx.port);
    const sessionId = randomUUID();
    const { tools, extraArgs } = armSettings(plan, run.arm, sessionId);
    event(p, run, 'started', {
      task: run.task,
      arm: run.arm,
      run: run.run,
      start,
      tree,
      sessionId,
      standIn: standIn ?? null,
    });
    freePort(ctx.port);
    let result;
    if (standIn) {
      // No agent: the proof's stand-in, committed as an agent would.
      const startedMs = Date.now();
      if (standIn.patch) {
        const applied = sh('git', ['apply', '--index', standIn.patch], { cwd: tree });
        if (applied.code !== 0) throw new Error(`the stand-in patch does not apply: ${applied.out}`);
        git(
          tree,
          '-c',
          'user.name=Stand-in',
          '-c',
          'user.email=stand-in@example.invalid',
          'commit',
          '-q',
          '-m',
          `Stand-in: ${basename(standIn.patch)}`,
        );
      }
      result = { exitCode: 0, wallClockMs: Date.now() - startedMs, report: standIn.answer ?? '' };
    } else {
      result = await runners[plan.runner ?? 'claude-cli'].run({
        prompt,
        cwd: tree,
        model: plan.model,
        env: agentEnvironment(ctx, p, run.arm),
        timeoutMs: plan.per_run.timeout_minutes * 60_000,
        maxBudgetUsd: plan.per_run.budget_usd,
        tools,
        extraArgs,
      });
    }
    const portHolders = freePort(ctx.port);
    const head = git(tree, 'rev-parse', 'HEAD');
    const uncommitted = git(tree, 'status', '--porcelain').split('\n').filter(Boolean);
    const changed = git(tree, 'diff', '--name-only', start, head).split('\n').filter(Boolean);
    let transcript;
    if (!standIn) {
      const found = findTranscript(sessionId);
      if (found) {
        mkdirSync(dirname(p.transcript), { recursive: true });
        copyFileSync(found, p.transcript);
        const sub = join(dirname(found), sessionId);
        if (existsSync(sub)) cpSync(sub, p.transcript.replace(/\.jsonl$/, ''), { recursive: true });
        transcript = { from: found, kept: p.transcript };
      }
    }
    agentState = {
      prepared,
      tree,
      start,
      head,
      tracked,
      changed,
      uncommitted,
      commits: Number(git(tree, 'rev-list', '--count', `${start}..${head}`)),
      sessionId,
      prompt: { sha256: sha256(prompt), bytes: Buffer.byteLength(prompt) },
      tools,
      extraArgs,
      result,
      portFreed: portHolders,
      transcript,
      standIn: standIn ? { patch: standIn.patch ?? null, answer: standIn.answer !== undefined } : undefined,
      ...(run.arm === 'C' && ctx.k3 && { k3: { package: ctx.k3, sha256: sha256(readFileSync(ctx.k3)) } }),
    };
    mkdirSync(dirname(p.state), { recursive: true });
    writeFileSync(p.state, `${JSON.stringify(agentState, null, 2)}\n`);
    event(p, run, 'agent-finished', {
      exitCode: result.exitCode,
      stoppedBy: result.stoppedBy,
      costUsd: result.costUsd,
      head,
      commits: agentState.commits,
    });
  }

  // 4: the measures and the leakage scan, from the transcript.
  const { tree, start, head, tracked, changed, uncommitted, result } = agentState;
  let measures = null;
  let leakage = { void: false, touched: [], seen: [] };
  if (existsSync(p.transcript)) {
    const lines = readTranscript(readFileSync(p.transcript, 'utf8'));
    const measured = measure({ lines, root: tree, tracked, changed, groundTruth, leakPaths: leakPaths(ctx) });
    ({ leakage } = measured);
    measures = { ...measured };
    delete measures.finalText;
    delete measures.leakage;
  }
  const agent = {
    sessionId: agentState.sessionId,
    transcript: agentState.transcript ? `transcripts/${basename(p.transcript)}` : null,
    exitCode: result.exitCode,
    ...(result.signal && { signal: result.signal }),
    ...(result.stoppedBy && { stoppedBy: result.stoppedBy }),
    isError: result.isError,
    numTurns: result.numTurns,
    durationMs: result.durationMs,
    wallClockMs: result.wallClockMs,
    costUsd: result.costUsd,
    modelUsage: result.modelUsage,
    tokens: tokensOf(result.modelUsage),
    ...(result.usage && { usage: result.usage, stderrTail: result.stderrTail }),
    report: result.report,
    prompt: agentState.prompt,
    tools: agentState.tools,
    extraArgs: agentState.extraArgs,
  };
  const record = {
    schemaVersion: 1,
    pilot: 'k4-pilot',
    id: p.id,
    plan: run.id,
    attempt,
    order: run.order,
    task: run.task,
    arm: run.arm,
    run: run.run,
    model: plan.model,
    ...(agentState.standIn && { standIn: agentState.standIn }),
    ...(repaired.length && {
      groundTruthRead: { repaired, why: 'the registered file is not valid YAML there; read in memory' },
    }),
    startedAt,
    tree: { start, head, commits: agentState.commits, changed, uncommitted },
    ...(agentState.k3 && { k3: agentState.k3 }),
    agent,
    void: leakage.void,
    leakage,
    measures,
  };

  // 5: the grading, or task 4's score.
  if (!leakage.void) {
    if (run.task === IMPACT_TASK) {
      const finalText =
        result.report ??
        (existsSync(p.transcript) ? toolCalls(readTranscript(readFileSync(p.transcript, 'utf8'))).finalText : '');
      const answer = parseAnswer(finalText, yaml.load, tree);
      const unchanged = head === start && uncommitted.length === 0;
      const score = scoreAnswer(answer, groundTruth.expected, { unchanged });
      score.answer = { rules: answer.rules, files: answer.files, tests: answer.tests };
      score.rules =
        ctx.flag('no-judge') || !answer.parses || !answer.rules.length
          ? {
              judge: ctx.flag('no-judge') ? 'not run (--no-judge): the operator matches the rules' : 'nothing to judge',
              operatorRead: false,
            }
          : await judgeRules(ctx, p, answer, groundTruth.expected);
      record.score = score;
      record.success = score.success;
    } else {
      const { start: gradingStart, baseline } = gradingSetup(ctx, p, run);
      const { applied, commit } = applyRun({ ...p, tree }, start, head, gradingStart);
      const grading = { repository: p.grading, start: gradingStart, commit: commit ?? null, applied };
      if (applied.pass) {
        const same =
          git(p.grading, 'rev-parse', `${commit}^{tree}`) === git(p.grading, 'rev-parse', `${gradingStart}^{tree}`);
        let own;
        let features;
        if (same) {
          // The tree graded is the start's: its grading is the baseline's.
          grading.gradedAs = 'baseline: the result is the start tree';
          own = { checks: baseline.checks };
          features = baseline.kit;
        } else {
          own = ownChecks(ctx, p.grading, gradingStart, commit, p.id);
          const graded = gradeKit(ctx, p, commit, gradingStart, p.grade, p.id);
          grading.command = graded.command;
          grading.report = `grades/${basename(p.grade)}`;
          features = graded.report.features;
        }
        const own101 = kitFeatureId(run.task);
        const hidden = features.find(each => each.feature === own101);
        grading.hidden = hidden
          ? { pass: hidden.M2.pass, tests: hidden.M2.tests, failed: hidden.M2.failed }
          : { pass: false, missing: true };
        grading.checks = Object.fromEntries(CHECKS.map(name => [name, own.checks[name]]));
        grading.apart = Object.fromEntries(APART.map(name => [name, own.checks[name]]));
        if (own.install) grading.install = own.install;
        grading.regressions = regressionsOf(baseline.kit, features, own101);
        grading.kit = {
          passed: features.filter(each => each.M2.pass).length,
          of: features.length,
          failing: features.filter(each => !each.M2.pass).map(each => each.feature),
        };
        const failedBefore = new Set(['test:units', 'test:e2e'].flatMap(name => baseline.checks[name]?.failed ?? []));
        grading.ownTestsNewlyFailing = ['test:units', 'test:e2e']
          .flatMap(name => own.checks[name]?.failed ?? [])
          .filter(each => !failedBefore.has(each));
      }
      record.grading = grading;
      record.success = codeSuccess(grading);
    }
  } else record.success = false;
  record.finishedAt = new Date().toISOString();

  // 6: the record, the log, the bundle.
  mkdirSync(dirname(p.record), { recursive: true });
  writeFileSync(p.record, `${JSON.stringify(record, null, 2)}\n`);
  event(p, run, 'run', {
    task: run.task,
    arm: run.arm,
    run: run.run,
    start,
    head,
    void: record.void,
    success: record.success,
    costUsd: agent.costUsd,
    tokens: agent.tokens,
    numTurns: agent.numTurns,
    durationMs: agent.durationMs,
    wallClockMs: agent.wallClockMs,
    sessionId: agent.sessionId,
    record: `records/${basename(p.record)}`,
  });
  if (existsSync(tree)) {
    mkdirSync(join(ctx.out, 'bundles'), { recursive: true });
    sh('git', ['bundle', 'create', join(ctx.out, 'bundles', `${p.id}.bundle`), '--all'], { cwd: tree });
    if (!ctx.flag('keep')) rmSync(p.runDir, { recursive: true, force: true });
  }
  rmSync(p.state, { force: true });
  return record;
}

// ---------------------------------------------------------------------------------------------------------------
// The dry run.

function dryRun(ctx, runs) {
  const problems = [];
  const notes = [];
  const lines = [];
  const plan = ctx.plan;
  const exists = (path, what) => existsSync(path) || (problems.push(`${what}: ${path} does not exist`), false);
  exists(ctx.openstay, "OpenStay's repository");
  if (
    existsSync(ctx.openstay) &&
    sh('git', ['cat-file', '-e', `${plan.codebase.start}^{commit}`], { cwd: ctx.openstay }).code !== 0
  )
    problems.push(`OpenStay's repository has no commit ${plan.codebase.start}`);
  exists(ctx.modules, "the J5b tree's node_modules");
  exists(join(J5_KIT, 'backlog/backlog.yaml'), "J5's kit");
  if (runs.some(run => run.arm === 'C') && !ctx.k3)
    problems.push(
      'arm C needs the K3 package: --k3 <clean-ddd-*.tgz> (npm pack of the reference at the commit K3 is merged at)',
    );
  else if (ctx.k3) exists(ctx.k3, 'the K3 package');
  const above = guidanceAbove(join(ctx.work, 'runs', '00', 'openstay'));
  if (above.length)
    problems.push(`guidance above the agents' trees would reach them: ${above.join(', ')}; choose another --work`);
  const checkedTasks = new Set();
  const counts = { recorded: 0, pending: 0, exhausted: 0 };
  for (const run of runs) {
    const status = runStatus(join(ctx.out, 'records'), run.id);
    counts[status.status]++;
    const p = paths(ctx, run, status.attempt ?? 1);
    if (!checkedTasks.has(run.task)) {
      checkedTasks.add(run.task);
      for (const file of ['task.md', 'ground-truth.yaml', 'solution.patch'])
        exists(join(p.taskDir, file), `task ${run.task}`);
      const hidden = existsSync(join(p.taskDir, 'acceptance'))
        ? readdirSync(join(p.taskDir, 'acceptance')).filter(name => name.endsWith('.acceptance.ts'))
        : [];
      if (hidden.length !== 1) problems.push(`task ${run.task}: ${hidden.length} hidden tests, not one`);
      try {
        const { repaired } = loadGroundTruth(readFileSync(join(p.taskDir, 'ground-truth.yaml'), 'utf8'), yaml.load);
        for (const each of repaired)
          notes.push(
            `task ${run.task}: ground-truth.yaml line ${each.line} is not valid YAML as registered (\`: \` in a plain scalar: "${each.was}"); read in memory with \` — \`, the file unchanged`,
          );
      } catch (error) {
        problems.push(`task ${run.task}: ground-truth.yaml does not parse (${error.message.split('\n')[0]})`);
      }
    }
    const taskText = existsSync(join(p.taskDir, 'task.md')) ? readFileSync(join(p.taskDir, 'task.md'), 'utf8') : '';
    const prompt = composePrompt(plan, taskText, run.arm, ctx.port);
    const { tools, extraArgs } = armSettings(plan, run.arm, '<a new uuid>');
    const args = claudeCliArguments({
      prompt: '<prompt>',
      model: plan.model,
      maxBudgetUsd: plan.per_run.budget_usd,
      tools,
      extraArgs,
    });
    const quote = arg => (/^[\w@%+=:,./<>-]+$/.test(arg) ? arg : `'${arg}'`);
    lines.push(
      `#${run.order} ${p.id} — task ${taskNumber(run.task)} (${run.task}), arm ${run.arm}, run ${run.run}: ${status.status}${status.voided ? ` (${status.voided} void before)` : ''}`,
      `  prepare  prepare-arm.sh ${run.arm} tasks/${run.task} ${ctx.openstay} ${p.tree} ${ctx.modules}${run.arm === 'C' ? ` ${ctx.k3 ?? '<K3 .tgz>'}` : ''}`,
      `  agent    cd ${p.tree} && PATH=${run.arm === 'C' ? `${p.tree}.k3/bin:` : ''}${dirname(process.execPath)}:$PATH TEST_DATABASE_URL=${plan.database.agent}/postgres OPENSTAY_POSTGRES=${plan.database.agent} claude ${args.map(quote).join(' ')}`,
      `           prompt: ${Buffer.byteLength(prompt)} bytes, sha256 ${sha256(prompt).slice(0, 12)}${run.arm === 'C' ? ", with C's sentence" : ''}; stopped by process group at ${plan.per_run.timeout_minutes} min`,
      run.task === IMPACT_TASK
        ? `  score    the final message's YAML block against ground-truth.yaml's expected (pooled F1 ≥ 0.6, the tree unchanged); rules by ${ctx.flag('no-judge') ? 'the operator (--no-judge)' : JUDGE_MODEL}`
        : `  grade    the diff onto ${p.grading} (B), its own checks (${[...CHECKS, ...APART].join(', ')}), then grade.mjs --project ${p.grading} --kit ${p.kit} --upto 101 --workers 2 --gate false --keep false`,
      `  record   ${p.record}; transcript ${p.transcript}`,
    );
    if (ctx.flag('show-prompt'))
      lines.push('  ----- prompt -----', ...prompt.split('\n').map(line => `  | ${line}`), '  ------------------');
  }
  const byArm = Object.fromEntries(['A', 'B', 'C'].map(arm => [arm, runs.filter(run => run.arm === arm).length]));
  const byTask = Object.fromEntries(
    [...new Set(runs.map(run => run.task))].map(task => [
      taskNumber(task),
      runs.filter(run => run.task === task).length,
    ]),
  );
  const spent = spentUsd(join(ctx.out, 'records'));
  lines.push(
    '',
    `${runs.length} run(s): ${Object.entries(byArm)
      .map(([arm, n]) => `${arm} ${n}`)
      .join(', ')}; per task ${Object.entries(byTask)
      .map(([task, n]) => `${task}: ${n}`)
      .join(', ')}`,
    `status: ${counts.recorded} recorded, ${counts.pending} pending, ${counts.exhausted} exhausted (void ${MAX_ATTEMPTS} times)`,
    `budget: $${plan.per_run.budget_usd} and ${plan.per_run.timeout_minutes} min a run, at most $${(counts.pending * plan.per_run.budget_usd).toFixed(0)} for the pending runs; spent $${spent.toFixed(2)} of the pilot's $${plan.pilot_budget_usd} (a run that could pass it is refused)`,
    `services: PostgreSQL agent ${plan.database.agent}, grading ${plan.database.grading}, under ${join(ctx.work, 'pg')}`,
    ...notes.map(each => `note: ${each}`),
    problems.length
      ? `problems (${problems.length}):\n${problems.map(each => `  - ${each}`).join('\n')}`
      : 'problems: none',
  );
  process.stdout.write(`${lines.join('\n')}\n`);
  return problems;
}

// ---------------------------------------------------------------------------------------------------------------

async function main(argv) {
  const ctx = context(argv);
  const services = ctx.option('services');
  if (services) {
    for (const name of ['agent', 'grading']) {
      if (services === 'start')
        process.stdout.write(`${JSON.stringify(startCluster(ctx.work, name, ctx.plan.database[name]))}\n`);
      else stopCluster(ctx.work, name, { remove: services === 'remove' });
    }
    return 0;
  }
  const all = ctx.plan.runs;
  const runs = ctx.flag('all')
    ? all
    : ctx.option('id')
      ? all.filter(run => run.id === ctx.option('id'))
      : ctx.option('order')
        ? all.filter(run => run.order === Number(ctx.option('order')))
        : ctx.flag('dry')
          ? all
          : [];
  if (!runs.length) {
    process.stderr.write('name a run: --id <id>, --order <n> or --all (see the header of run-task.mjs)\n');
    return 2;
  }
  if (ctx.flag('dry')) return dryRun(ctx, runs).length ? 1 : 0;

  const standInOption = ctx.option('stand-in');
  const standInAnswer = ctx.option('stand-in-answer');
  const standIn =
    standInOption || standInAnswer
      ? {
          ...(standInOption && standInOption !== 'none' && { patch: resolve(standInOption) }),
          ...(standInAnswer && { answer: readFileSync(resolve(standInAnswer), 'utf8') }),
        }
      : undefined;
  // A stand-in's record is a proof's, never the pilot's: it is written only where it is asked to be.
  if (standIn && !ctx.option('out')) {
    process.stderr.write("a stand-in run needs its own --out (a scratch directory), never the pilot's records\n");
    return 2;
  }

  // One driver at a time on a work directory.
  mkdirSync(ctx.work, { recursive: true });
  const lock = join(ctx.work, 'run-task.lock');
  if (existsSync(lock)) {
    const pid = Number(readFileSync(lock, 'utf8'));
    let alive = false;
    try {
      process.kill(pid, 0);
      // After a restart the pid is reused by another process: only a run-task holds the lock.
      alive = pid !== process.pid && readFileSync(`/proc/${pid}/cmdline`, 'utf8').includes('run-task.mjs');
    } catch {
      alive = false;
    }
    if (alive) {
      process.stderr.write(`another run-task (pid ${pid}) works in ${ctx.work}\n`);
      return 2;
    }
  }
  writeFileSync(lock, String(process.pid));
  process.once('exit', () => rmSync(lock, { force: true }));

  let failures = 0;
  for (const run of runs) {
    for (;;) {
      const status = runStatus(join(ctx.out, 'records'), run.id);
      if (status.status === 'recorded') {
        process.stdout.write(`${run.id}: recorded (${status.record.success ? 'success' : 'failure'}), not run again\n`);
        break;
      }
      if (status.status === 'exhausted') {
        process.stdout.write(`${run.id}: void ${status.voided} times; the operator decides\n`);
        failures++;
        break;
      }
      const resuming = existsSync(paths(ctx, run, status.attempt).state);
      if (!standIn && !resuming) {
        const spent = spentUsd(join(ctx.out, 'records'));
        if (spent + ctx.plan.per_run.budget_usd > ctx.plan.pilot_budget_usd) {
          process.stderr.write(
            `${run.id}: $${spent.toFixed(2)} spent; a run of $${ctx.plan.per_run.budget_usd} could pass the pilot's $${ctx.plan.pilot_budget_usd}: not started\n`,
          );
          return 1;
        }
      }
      if (run.arm === 'C' && !ctx.k3 && !resuming) {
        process.stderr.write(`${run.id}: arm C needs --k3 <the K3 package .tgz>\n`);
        return 2;
      }
      process.stdout.write(
        `${attemptId(run.id, status.attempt)}: ${resuming ? 'grading the finished agent' : 'running'} (task ${run.task}, arm ${run.arm})\n`,
      );
      const record = await runAttempt(ctx, run, status.attempt, standIn);
      process.stdout.write(
        `${record.id}: ${record.void ? 'VOID (leakage), run again under the next id' : record.success ? 'success' : 'failure'}` +
          `${record.agent.costUsd !== undefined ? `, $${record.agent.costUsd.toFixed(2)}` : ''}${record.agent.tokens !== undefined ? `, ${record.agent.tokens} tokens` : ''}` +
          ` — ${join(ctx.out, 'records', `${record.id}.json`)}\n`,
      );
      if (!record.void) {
        if (!record.success) failures++;
        break;
      }
    }
  }
  return failures ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then(
    code => process.exit(code),
    error => {
      process.stderr.write(`${error.stack ?? error}\n`);
      process.exit(1);
    },
  );
}
