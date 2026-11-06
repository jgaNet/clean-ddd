#!/usr/bin/env node
/**
 * A backlog delivered feature by feature, each from the smallest model up (OpenStay's escalation
 * rule, docs/evaluations/benchmark/openstay/README.md#the-models-the-smallest-first-one-step-up-when-it-fails).
 *
 *   node .claude/flow/run-ladder.mjs --project <dir> --plan <execution-plan.yaml> [--resume]
 *
 *   run: pilot-simple-1
 *   arm: simple                 # simple: a plain project, `yarn verify`; clean: clean-ddd, the gate with --fix and the storm
 *   kit: ../../docs/evaluations/benchmark/openstay/pilot   # the backlog, the storms, the hidden tests; relative to this file
 *   base: main                  # the created commit
 *   ladder: [<smallest>, <intermediate>, <strongest>]       # the models, in the order a feature climbs them
 *   agent: { runner: claude-cli, timeoutMinutes: 60 }
 *   retry: { perFeature: 1 }    # the driver's verdict sent back to the same conversation, within an attempt
 *   budgetUsd: 40               # the run's ceiling, reserved before each agent starts
 *   agentBudgetUsd: 8           # the most one attempt may spend
 *   dependencies: copy
 *   ports: { base: 19100 }
 *   tooling: ../vendor/clean-ddd-0.2.0.tgz                  # clean only, optional: the package the grader runs
 *   features: [accounts, …]     # optional: only these, in the backlog's order
 *
 * For each feature, in order, from the project's `main`:
 *   1. an attempt with the next model of the ladder, in a fresh worktree at the commit the feature
 *      starts from, in a fresh conversation (a conversation never changes model);
 *   2. the driver's verdict, as every campaign has it: `yarn verify` for the simple arm, the gate
 *      with `--fix` and the storm owing nothing for the clean arm; sent back `retry.perFeature` times;
 *   3. the hidden tests of this feature and of every feature before it, by grade.mjs, in a worktree
 *      of the grader's own, removed once graded, so that no agent ever reads them.
 * A feature that fails 3 is graded again alone, in a worktree of its own, before anything is
 * decided: only what fails again counts (the `replayed` event keeps both gradings). A verdict that
 * still refuses the tree after the last send-back is checked once more the same way, holding a lock
 * no other ladder's replay holds, before it counts (`verdict-replayed`): J4's verdicts that failed
 * under load passed alone.
 * The attempt delivers when 2 and 3 pass: `main` moves to it. Otherwise it escalates, and the reason
 * is recorded: `hidden` (its own test), `regression` (an earlier feature's), `ceiling` (the
 * supervisor stopped it), or `verdict` (the driver refused the tree). A feature the last model also
 * fails is FAILED, and the tree stops there: every later feature builds on it, and its hidden tests
 * could not tell a later failure from this one. That rule was written before any run.
 *
 * Every attempt is logged in `<project>.flow/<run>.jsonl`: its model and step, its time, cost and
 * turns (the runner's figures; a send-back continues the conversation, whose reported cost is its
 * running total, so `costUsd` is what this agent turn added and `conversationCostUsd` the total),
 * the reason it escalated, and the size of the tree it started from.
 * Before an escalation is counted, the failure is checked against the kit, by reading the log: a
 * defect of the kit is an amendment, and the attempts it touched are graded again.
 */
import { execFileSync, spawn } from 'node:child_process';
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { runners } from './runners.mjs';
import { budget, DEPENDENCY_MODES, freePort, provideDependencies } from './supervision.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : fallback);
function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

const project = resolve(option('project') ?? fail('--project is required'));
const planFile = resolve(option('plan') ?? fail('--plan is required'));
const yaml = createRequire(join(project, 'package.json'))('js-yaml');
const plan = yaml.load(readFileSync(planFile, 'utf8'));
for (const key of ['run', 'arm', 'kit', 'base', 'ladder']) if (!plan[key]) fail(`${planFile}: ${key} is required`);
if (!['simple', 'clean'].includes(plan.arm)) fail(`${planFile}: arm is simple or clean`);
if (!Array.isArray(plan.ladder) || !plan.ladder.length) fail(`${planFile}: ladder lists at least one model`);
const clean = plan.arm === 'clean';
const run = plan.run;
const kit = resolve(dirname(planFile), plan.kit);
const backlog = yaml
  .load(readFileSync(join(kit, 'backlog/backlog.yaml'), 'utf8'))
  .features.filter(f => !plan.features || plan.features.includes(f.id));
/**
 * `runner: command` stands in for an agent, to rehearse the driver without spending: it runs
 * `agent.command` in the attempt's worktree, with the step's model in MODEL and the turn's prompt
 * in PROMPT, and reports no cost.
 */
const commandRunner = {
  name: 'command',
  async run({ cwd, model, prompt }) {
    const begun = Date.now();
    const done = await new Promise(resolveRun => {
      const child = spawn('sh', ['-c', plan.agent.command], {
        cwd,
        env: { ...process.env, MODEL: model, PROMPT: prompt },
        stdio: 'ignore',
      });
      child.on('close', code => resolveRun(code));
    });
    return { exitCode: done, wallClockMs: Date.now() - begun, costUsd: 0, numTurns: 1 };
  },
};
const runner = plan.agent?.runner === 'command' ? commandRunner : runners[plan.agent?.runner ?? 'claude-cli'];
if (!runner) fail(`${planFile}: agent.runner is claude-cli, claude-sdk or command`);
const timeoutMs = (plan.agent?.timeoutMinutes ?? 60) * 60_000;
const retries = plan.retry?.perFeature ?? 1;
const budgetUsd = plan.budgetUsd ?? 40;
const dependencies = plan.dependencies ?? 'copy';
if (!DEPENDENCY_MODES.includes(dependencies)) fail(`${planFile}: dependencies is ${DEPENDENCY_MODES.join(' or ')}`);
const port = plan.ports?.base ?? 19100;
const grader = resolve(new URL('./grade.mjs', import.meta.url).pathname);
// The lock a replayed verdict holds, shared by every ladder on the machine.
const replayLock = plan.replayLock ?? join(tmpdir(), 'clean-ddd-ladder-replay.lock');
const tooling = plan.tooling ? resolve(dirname(planFile), plan.tooling) : undefined;

const flowDir = `${project}.flow`;
const runDir = join(flowDir, 'worktrees', run);
const log = join(flowDir, `${run}.jsonl`);
mkdirSync(runDir, { recursive: true });
const resuming = args.includes('--resume');
if (existsSync(log) && !resuming) fail(`${log} exists: a run id is used once`);
const before = resuming && existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse) : [];
const delivered = new Set(before.filter(each => each.event === 'delivered').map(each => each.feature));

const event = (name, data = {}) => {
  const line = { run, event: name, at: new Date().toISOString(), ...data };
  appendFileSync(log, `${JSON.stringify(line)}\n`);
  process.stdout.write(
    `${line.at.slice(11, 19)} ${name}${data.feature ? ` ${data.feature}` : ''}${data.step !== undefined ? ` step ${data.step}` : ''}${data.reason ? ` (${data.reason})` : ''}\n`,
  );
  return line;
};
const git = (cwd, ...gitArgs) =>
  execFileSync('git', gitArgs, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).trim();
const commitAll = (cwd, message) => {
  git(cwd, 'add', '-A');
  if (!git(cwd, 'status', '--porcelain')) return false;
  git(cwd, '-c', 'user.name=flow', '-c', 'user.email=flow@example.com', 'commit', '-qm', message);
  return true;
};
const env = { ...process.env, YARN_IGNORE_ENGINES: 'true', FORCE_COLOR: '0', NO_COLOR: '1' };
function sh(command, cwd, timeout = timeoutMs) {
  return new Promise(done => {
    const child = spawn('sh', ['-c', command], { cwd, env, detached: true });
    let out = '';
    child.stdout.on('data', chunk => (out += chunk));
    child.stderr.on('data', chunk => (out += chunk));
    // A check stopped for its time says so: whoever reads its output (the agent, sent back) must know why it failed.
    const timer = setTimeout(() => {
      out += `\n${command.split(' ').slice(0, 3).join(' ')}: stopped after ${Math.round(timeout / 60000)} minutes, the time this check is given.\n`;
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        // already gone
      }
    }, timeout);
    child.on('close', code => {
      clearTimeout(timer);
      done({ code, out });
    });
  });
}
const tail = (text, count = 60) =>
  String(text ?? '')
    .split('\n')
    .map(line => line.replace(/\s+$/, ''))
    .filter(Boolean)
    .slice(-count);
const parse = text => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

/** The size of the tree an attempt starts from: TypeScript under `src/`, tests apart. */
function size(cwd) {
  const files = git(cwd, 'ls-files', 'src')
    .split('\n')
    .filter(file => file.endsWith('.ts'));
  const tests = files.filter(file => /\.(spec|test)\.ts$/.test(file));
  const lines = list =>
    list.reduce((total, file) => total + readFileSync(join(cwd, file), 'utf8').split('\n').length, 0);
  const sources = files.filter(file => !tests.includes(file));
  const modules = new Set(
    sources.map(file => (clean ? file.match(/^src\/Contexts\/([^/]+)/)?.[1] : file.split('/').slice(0, -1).join('/'))),
  );
  modules.delete(undefined);
  return { sourceFiles: sources.length, sourceLines: lines(sources), testFiles: tests.length, modules: modules.size };
}

const hasStorm = feature => existsSync(join(kit, 'storms', `${feature.id}.yaml`));
const request = feature => readFileSync(join(kit, 'backlog', `${feature.n}-${feature.id}.md`), 'utf8').trim();
// A plan that runs part of a backlog (a probe) may say how long the whole one is, so the prompt reads as it did.
const last = plan.of ?? Math.max(...backlog.map(each => each.n));
// A backlog entry of `kind: report` is a defect a user reported in what is already delivered, given
// as a feature is (its request, its storm if any, its hidden test), and graded the same way.
const opening = feature =>
  feature.kind === 'report'
    ? `${clean ? 'You are maintaining an application built on the clean-ddd architecture' : 'You are maintaining an application'}. A user reported a defect in what is already delivered; fix it.`
    : clean
      ? `You are writing an application built on the clean-ddd architecture, one feature at a time. This is feature ${feature.n} of ${last}; the earlier ones are in the code.`
      : `You are writing an application, one feature at a time. This is feature ${feature.n} of ${last}; the earlier ones are in the code.`;
const brief = (feature, from) =>
  [
    opening(feature),
    'Read `CLAUDE.md` first and follow it. Do not ask questions: decide, and say in your final report what was unclear.',
    '',
    ...(clean && hasStorm(feature)
      ? [
          `The feature's storm, decided with the product's owner before you started, is \`conventions/storms/${feature.id}.yaml\`: its hot spots are decided, do not change them. \`yarn architecture storm --expect conventions/storms/${feature.id}.yaml\` says what the code still owes it; once it owes nothing, \`yarn architecture gate --fix\` marks it done.`,
          '',
        ]
      : []),
    ...(clean
      ? [
          'If the feature needs a context or a relationship between contexts that the application does not have yet, that is an architecture task, and it is yours: declare it, record the decision in an ADR under `docs/adr/`, then write the feature (`yarn architecture mode architecture` says what that takes).',
          `You are done when \`yarn architecture gate --base ${from} --mode architecture --fix\` passes${hasStorm(feature) ? ' and the storm owes nothing' : ''}. Commit your work on the current branch; do not push. If you start a server, use port ${port}.`,
        ]
      : [
          `You are done when \`yarn verify\` passes. Commit your work on the current branch; do not push. If you start a server, use port ${port}.`,
        ]),
    '',
    feature.kind === 'report'
      ? "The report, in the user's words:"
      : 'The feature, in product words, with the API it answers:',
    '',
    request(feature),
  ].join('\n');
const feedback = lines =>
  `The driver checked your work and it is not done:\n\n${lines.join('\n')}\n\nFix it, then commit. The request is unchanged.`;

/** The driver's verdict on the tree: what every campaign's driver checks, never the hidden tests. */
async function verdict(feature, cwd, from, alone = false) {
  commitAll(cwd, `${feature.id}: work the agent left uncommitted`);
  // Alone: wait for the lock every ladder's replay takes, so that no two replays run at once.
  const locked = command => (alone ? `flock ${replayLock} ${command}` : command);
  if (!clean) {
    const checked = await sh(locked('yarn -s verify'), cwd, alone ? 3_600_000 : 900_000);
    return checked.code === 0 ? [] : ['`yarn verify` fails:', ...tail(checked.out)];
  }
  const gated = parse(
    (
      await sh(
        locked(`yarn -s architecture gate --base ${from} --mode architecture --fix --json`),
        cwd,
        alone ? 3_600_000 : timeoutMs,
      )
    ).out,
  );
  const failing = (gated?.steps ?? []).filter(step => step.status === 'fail');
  let owed = [];
  if (hasStorm(feature)) {
    const done = join(runDir, 'storms', `${feature.id}.yaml`);
    mkdirSync(dirname(done), { recursive: true });
    writeFileSync(
      done,
      readFileSync(join(kit, 'storms', `${feature.id}.yaml`), 'utf8').replace(/^done: false$/m, 'done: true'),
    );
    owed = parse((await sh(`yarn -s architecture storm --expect ${done} --json`, cwd, 300_000)).out)?.problems ?? [
      'the storm could not be read',
    ];
  }
  if (!gated) return ['the gate did not answer'];
  return [
    ...failing.flatMap(step => [`${step.name}:`, ...(step.lines ?? []).map(line => `  ${line}`)]),
    ...(owed.length ? ['The storm still owes:', ...owed.map(line => `  ${line}`)] : []),
  ];
}

/** The hidden tests of the features up to this one, graded where no agent reads them. */
async function hidden(feature, cwd, only) {
  const out = join(runDir, `grade-${feature.id}-${only ? 'replay-' : ''}${Date.now()}.json`);
  const graded = await sh(
    [
      `node ${grader} --project ${project} --ref ${git(cwd, 'rev-parse', 'HEAD')} --base ${baseCommit}`,
      `--kit ${kit} --upto ${feature.n} --keep false --out ${out}`,
      only ? `--only ${only.join(',')}` : '',
      clean ? (tooling ? `--tooling ${tooling}` : '') : '--control plain',
    ].join(' '),
    project,
    3_600_000,
  );
  const report = existsSync(out) ? parse(readFileSync(out, 'utf8')) : undefined;
  if (!report) return { graded: false, lines: tail(graded.out, 30) };
  const failing = report.features.filter(each => !each.M2.pass);
  return {
    graded: true,
    failing: failing.map(each => each.feature),
    own: failing.filter(each => each.feature === feature.id).flatMap(each => each.M2.failed),
    earlier: failing.filter(each => each.feature !== feature.id).map(each => each.feature),
    report: out,
  };
}

const money = budget({ totalUsd: budgetUsd, perAgentUsd: plan.agentBudgetUsd ?? budgetUsd });
// What each conversation (a worktree) has reported so far: a continued one reports its running total.
const reportedSoFar = new Map();
let current;
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    current?.stop?.();
    event('finished', { state: 'CANCELLED', costUsd: money.spent() });
    process.exit(130);
  });
}

/** One agent turn; undefined when the budget cannot reserve one. */
async function agent(feature, step, cwd, prompt, again) {
  const cap = money.reserve(cwd);
  if (cap === undefined) return undefined;
  const result = await runner.run({
    prompt,
    cwd,
    project,
    model: plan.ladder[step],
    again,
    env: { ...env, PORT: String(port) },
    timeoutMs,
    maxBudgetUsd: cap,
    onProcess: handle => (current = handle),
  });
  current = undefined;
  money.settle(cwd, result.costUsd);
  const { report, ...figures } = result;
  if (result.costUsd !== undefined) {
    const before = again ? (reportedSoFar.get(cwd) ?? 0) : 0;
    reportedSoFar.set(cwd, result.costUsd);
    figures.conversationCostUsd = result.costUsd;
    figures.costUsd = Number(Math.max(0, result.costUsd - before).toFixed(4));
  }
  event('agent-finished', { feature: feature.id, step, model: plan.ladder[step], ...figures, report });
  const stopped = freePort(port);
  if (stopped.length) event('port-freed', { feature: feature.id, port, processes: stopped });
  return result;
}

/** One attempt at one step of the ladder: its agent, the verdict sent back, the hidden tests. */
async function attempt(feature, step, from) {
  const id = `${feature.id}-${step}`;
  const cwd = join(runDir, id);
  // A run resumed after its driver was lost starts the attempt it was in again, from scratch.
  if (existsSync(cwd)) git(project, 'worktree', 'remove', '--force', cwd);
  git(project, 'worktree', 'add', '-q', '-B', `run/${run}/${id}`, cwd, from);
  provideDependencies(project, cwd, dependencies);
  if (clean && hasStorm(feature)) {
    const target = join(cwd, 'conventions/storms', `${feature.id}.yaml`);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(kit, 'storms', `${feature.id}.yaml`), target);
    commitAll(cwd, `storm: ${feature.id}, decided before the run`);
  }
  const begun = Date.now();
  event('attempt', { feature: feature.id, step, model: plan.ladder[step], from, tree: size(cwd) });
  let result = await agent(feature, step, cwd, brief(feature, from), false);
  if (!result) return { reason: 'budget' };
  let problems = result.stoppedBy ? [] : await verdict(feature, cwd, from);
  for (let turn = 0; !result.stoppedBy && problems.length && turn < retries; turn++) {
    result = await agent(feature, step, cwd, feedback(problems), true);
    if (!result) return { reason: 'budget' };
    if (!result.stoppedBy) problems = await verdict(feature, cwd, from);
  }
  if (!result.stoppedBy && problems.length) {
    const again = await verdict(feature, cwd, from, true);
    event('verdict-replayed', { feature: feature.id, step, first: problems.slice(0, 40), still: again.slice(0, 40) });
    problems = again;
  }
  const wallClockMs = Date.now() - begun;
  if (result.stoppedBy) return { reason: 'ceiling', cwd, wallClockMs, lines: [`stopped by ${result.stoppedBy}`] };
  if (problems.length) return { reason: 'verdict', cwd, wallClockMs, lines: problems.slice(0, 80) };
  let tests = await hidden(feature, cwd);
  if (!tests.graded) return { reason: 'ungraded', cwd, wallClockMs, lines: tests.lines };
  // A failure is replayed alone before it counts: graded beside three other trees, a server that
  // did not answer in time failed five attempts of OpenStay's J3 that passed when replayed. Only
  // what fails again escalates; both gradings are kept.
  if (tests.failing.length) {
    const replay = await hidden(feature, cwd, tests.failing);
    event('replayed', {
      feature: feature.id,
      step,
      failed: tests.failing,
      still: replay.graded ? replay.failing : tests.failing,
      first: tests.report,
      report: replay.report,
    });
    if (replay.graded) tests = { ...replay, report: `${tests.report} ${replay.report}` };
  }
  if (tests.own.length) return { reason: 'hidden', cwd, wallClockMs, lines: tests.own, report: tests.report };
  if (tests.earlier.length)
    return { reason: 'regression', cwd, wallClockMs, lines: tests.earlier, report: tests.report };
  return { reason: undefined, cwd, wallClockMs, report: tests.report };
}

// A resumed run keeps the commit it started from: its main has moved since, and the grader compares the dependencies,
// and the gate the changes, with this commit.
const baseCommit = before.find(each => each.event === 'started')?.baseCommit ?? git(project, 'rev-parse', plan.base);
const started = Date.now();
event(resuming ? 'resumed' : 'started', {
  arm: plan.arm,
  project,
  baseCommit,
  runner: runner.name,
  ladder: plan.ladder,
  budgetUsd,
  delivered: [...delivered],
});

const outcomes = {};
let stopped = false;
for (const feature of backlog) {
  if (delivered.has(feature.id)) {
    outcomes[feature.id] = 'DELIVERED';
    continue;
  }
  if (stopped) {
    outcomes[feature.id] = 'NOT STARTED';
    continue;
  }
  const from = git(project, 'rev-parse', 'main');
  // A resumed run goes on from the step after the last one this feature escalated from: the steps
  // already judged are not tried again (J5: a restart mid-ladder would otherwise give a feature that
  // escalated twice a fresh ladder).
  const judged = before
    .filter(each => each.event === 'escalated' && each.feature === feature.id)
    .map(each => each.step);
  const firstStep = judged.length ? Math.max(...judged) + 1 : 0;
  event('feature-start', { feature: feature.id, from, ...(firstStep > 0 && { firstStep }) });
  let deliveredAt;
  for (let step = firstStep; step < plan.ladder.length && deliveredAt === undefined; step++) {
    const tried = await attempt(feature, step, from);
    if (tried.reason === 'budget') {
      event('budget', { feature: feature.id, step, spentUsd: money.spent(), budgetUsd });
      stopped = true;
      break;
    }
    // An attempt's worktree is removed once it is judged: its branch keeps what it committed, and
    // a pilot of eight trees would not fit on the disk with every attempt's dependencies kept.
    const head = tried.cwd ? git(tried.cwd, 'rev-parse', 'HEAD') : undefined;
    if (tried.cwd) git(project, 'worktree', 'remove', '--force', tried.cwd);
    if (tried.reason) {
      event('escalated', {
        feature: feature.id,
        step,
        reason: tried.reason,
        head,
        lines: tried.lines,
        report: tried.report,
      });
      continue;
    }
    git(project, 'merge', '-q', '--ff-only', head);
    deliveredAt = step;
    event('delivered', {
      feature: feature.id,
      step,
      model: plan.ladder[step],
      head: git(project, 'rev-parse', 'main'),
      report: tried.report,
    });
  }
  if (deliveredAt !== undefined) outcomes[feature.id] = `DELIVERED at step ${deliveredAt}`;
  else if (stopped) outcomes[feature.id] = 'NOT STARTED';
  else {
    // The last model failed too: the tree stops, and a maintainer calls it FAILED, or the kit's, by the
    // rule written before the runs (the kit's triage.md), from what this note gathers.
    outcomes[feature.id] = 'NEEDS TRIAGE';
    event('needs-triage', { feature: feature.id, ...(await triage(feature)) });
    stopped = true;
  }
}

/**
 * What a maintainer reads before calling a feature every model failed FAILED (J5: two such failures were the kit's —
 * an upload race, a field the request never defined — and were found by hand). Gathered for any tree alike:
 * - each step's escalation, the tests it failed and what they said;
 * - whether every step failed the same tests (a fault no model got past is worth a second look), and how many;
 * - when the plan names a judge model, its answer to one question: does the request, read alone, decide what the
 *   failing assertion expects? It reads the request and the failing test, never the tree's code or its arm.
 */
async function triage(feature) {
  const escalations = readFileSync(log, 'utf8')
    .trim()
    .split('\n')
    .map(line => parse(line))
    .filter(each => each?.event === 'escalated' && each.feature === feature.id);
  const steps = escalations.map(each => {
    const reportPath = String(each.report ?? '')
      .split(' ')
      .pop();
    const report = reportPath && existsSync(reportPath) ? parse(readFileSync(reportPath, 'utf8')) : undefined;
    const said = (report?.features ?? []).filter(f => !f.M2?.pass).flatMap(f => f.M2.said ?? []);
    return { step: each.step, reason: each.reason, head: each.head, failed: each.lines ?? [], said };
  });
  const sets = steps.map(each => [...each.failed].sort().join('\n'));
  const failedTests = [...new Set(steps.flatMap(each => each.failed))];
  const signals = {
    steps,
    sameFailureEveryStep: sets.length > 1 && sets.every(each => each === sets[0]),
    failedTests: failedTests.length,
  };
  if (!plan.triage?.judge || feature.kind === 'report') return signals;
  const testFile = join(kit, 'acceptance', `${feature.n}-${feature.id}.acceptance.ts`);
  const prompt = [
    'A benchmark grades an implementation of a product request with a hidden test the implementer never sees. Every model failed the assertions below.',
    'Read the request as the implementer did, and say whether its text decides what the failing assertions expect: a field, a value, an id, a status, an order.',
    'Answer only with JSON: {"determined": true|false, "quote": "the words of the request that decide it, or empty", "why": "one or two sentences"}.',
    '',
    '----- the request -----',
    request(feature),
    '',
    '----- what the failing assertions said, at the last step -----',
    ...(steps.at(-1)?.said ?? []),
    '',
    '----- the hidden test -----',
    existsSync(testFile) ? readFileSync(testFile, 'utf8') : '(not found)',
  ].join('\n');
  const judged = await new Promise(done => {
    const child = spawn(
      'claude',
      ['-p', prompt, '--output-format', 'json', '--model', plan.triage.judge, '--tools', ''],
      {
        cwd: tmpdir(),
      },
    );
    let out = '';
    child.stdout.on('data', chunk => (out += chunk));
    child.on('close', () => done(parse(out)?.result ?? ''));
  });
  const verdict = parse(String(judged).match(/\{[\s\S]*\}/)?.[0] ?? '');
  return { ...signals, judge: verdict ?? { unreadable: String(judged).slice(0, 500) } };
}

const all = backlog.every(f => String(outcomes[f.id]).startsWith('DELIVERED'));
event('finished', {
  state: all ? 'COMPLETED' : 'STOPPED',
  features: outcomes,
  head: git(project, 'rev-parse', 'main'),
  costUsd: money.spent(),
  leadTimeMs: Date.now() - started,
});
process.exit(all ? 0 : 1);
