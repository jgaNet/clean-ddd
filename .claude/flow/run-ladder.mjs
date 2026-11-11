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
 *   budgetUsd: 40               # the run's ceiling, across resumes, reserved before each agent starts
 *   agentBudgetUsd: 8           # the most one attempt may spend
 *   dependencies: copy
 *   ports: { base: 19100 }
 *   tooling: ../vendor/clean-ddd-0.2.0.tgz                  # clean only, optional: the package the grader runs
 *   features: [accounts, …]     # optional: only these, in the backlog's order
 *   machine: { ladders: 3 }     # optional: how many ladders run at once on the machine (FLOW_LADDERS overrides it)
 *   gradeTimeoutMinutes: 60     # optional: the time one grading is given
 *   fanOut: { rounds: 2 }       # clean only, optional: a feature whose storm lists several contexts is written by one
 *                               # agent per context, and integrated by integrator.mjs (ADR 38)
 *   push: { remote: <url|name>, branch: trees/<x>, logBranch: logs/<x> }   # optional: after each delivery, the tree's
 *                               # main is pushed, and the log and the gradings are committed to logBranch and pushed
 *
 * The ladder refuses to start on a Node older than the project's `engines.node`, and puts its own Node first on the
 * PATH of every command it runs; it waits for one of `machine.ladders` slots before it starts (machine.mjs).
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
 * With `regressionCheck: { from: n }` in the plan, an earlier feature that still fails is graded n times on the commit
 * the attempt started from: one that fails there too is not counted against the attempt, which delivers with it named
 * as `unstable` for the triage (`regressions-on-from` keeps the gradings). Off when the plan does not say it.
 * The attempt delivers when 2 and 3 pass: `main` moves to it. Otherwise it escalates, and the reason
 * is recorded: `hidden` (its own test), `regression` (an earlier feature's), `ceiling` (the
 * supervisor stopped it), or `verdict` (the driver refused the tree). A feature the last model also
 * fails is FAILED, and the tree stops there: every later feature builds on it, and its hidden tests
 * could not tell a later failure from this one. That rule was written before any run.
 *
 * With `fanOut`, an attempt at a feature whose storm lists more than one context is written by one agent per context,
 * each with the step's model, on a branch of its own, in parallel. The storm's first context owns the feature: its
 * agent owns its context's folder and everything no other context's agent owns (the composition root, the conventions,
 * the decisions); each other agent owns its context's folder and the integration events it publishes. Each is told
 * what it owns, and talks to the others through a channel (`channel say|wait|read`). Each owner's verdict is the gate
 * on its branch without --fix, and its scope (a file another owner owns is refused); the relationship tests are left
 * out of it, since only the merged feature can pass them (ADR 38). Then the integrator merges the branches, runs the
 * clean arm's verdict on the merged result, routes each failure to its owner, two rounds at most; the merged result is
 * graded as any attempt's head is.
 *
 * Every attempt is logged in `<project>.flow/<run>.jsonl`: its model and step, its time, cost and
 * turns (the runner's figures; a send-back continues the conversation, whose reported cost is its
 * running total, so `costUsd` is what this agent turn added and `conversationCostUsd` the total),
 * the reason it escalated, and the size of the tree it started from.
 * Before an escalation is counted, the failure is checked against the kit, by reading the log: a
 * defect of the kit is an amendment, and the attempts it touched are graded again.
 */
import { execFileSync, spawn } from 'node:child_process';
import {
  appendFileSync,
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { integrate, ownerOf } from './integrator.mjs';
import { nodeMismatch, pathWithThisNode, takeSlot } from './machine.mjs';
import { runners } from './runners.mjs';
import { budget, DEPENDENCY_MODES, freePort, provideDependencies, regressionsAgainstFrom } from './supervision.mjs';

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
// The machine the comparison runs on (machine.mjs): the Node the project declares, and a bounded number of ladders.
const nodeProblem = nodeMismatch(project);
if (nodeProblem) fail(nodeProblem);
const ladderSlots = Number(process.env.FLOW_LADDERS ?? plan.machine?.ladders ?? 3);
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
  async run({ cwd, model, prompt, env: given }) {
    const begun = Date.now();
    const done = await new Promise(resolveRun => {
      // The agent's environment, as a real runner gets it (an owner's TEAM, its channel on the PATH, its PORT).
      const child = spawn('sh', ['-c', plan.agent.command], {
        cwd,
        env: { ...(given ?? process.env), PATH: given?.PATH ?? pathWithThisNode(), MODEL: model, PROMPT: prompt },
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
const gradeTimeoutMs = (plan.gradeTimeoutMinutes ?? 60) * 60_000;
const fanOut = plan.fanOut;
if (fanOut !== undefined && !clean) fail(`${planFile}: fanOut is for the clean arm`);
if (fanOut !== undefined && !(Number.isInteger(fanOut?.rounds ?? 2) && (fanOut?.rounds ?? 2) >= 0))
  fail(`${planFile}: fanOut is { rounds: <how many rounds the integrator sends failures back> }`);
const publishTo = plan.push;
if (publishTo !== undefined && !(publishTo.remote && publishTo.branch))
  fail(`${planFile}: push is { remote, branch, logBranch? }`);
const grader = resolve(new URL('./grade.mjs', import.meta.url).pathname);
// The lock a replayed verdict holds, shared by every ladder on the machine.
const replayLock = plan.replayLock ?? join(tmpdir(), 'clean-ddd-ladder-replay.lock');
const tooling = plan.tooling ? resolve(dirname(planFile), plan.tooling) : undefined;
// Off unless the plan asks: an earlier feature that fails an attempt is graded on the commit the attempt started from,
// `from` times, before it counts as a regression (a plan written before this option keeps the old rule on resume).
const regressionCheck = plan.regressionCheck;
if (regressionCheck !== undefined && !(Number.isInteger(regressionCheck?.from) && regressionCheck.from > 0))
  fail(`${planFile}: regressionCheck is { from: <how many gradings on the start, at least 1> }`);

const flowDir = `${project}.flow`;
const runDir = join(flowDir, 'worktrees', run);
const log = join(flowDir, `${run}.jsonl`);
mkdirSync(runDir, { recursive: true });
const resuming = args.includes('--resume');
if (existsSync(log) && !resuming) fail(`${log} exists: a run id is used once`);
const logged = resuming && existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse) : [];
// A `revoked` event (the maintainer's, when the harness judged a feature wrongly) sets aside what was logged for that
// feature before it: its delivery and its escalations no longer count, and the events after it say where it resumes.
const revokedAt = new Map(logged.flatMap((each, index) => (each.event === 'revoked' ? [[each.feature, index]] : [])));
const before = logged.filter((each, index) => !(index < (revokedAt.get(each.feature) ?? -1)));
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
/**
 * With `push` in the plan: the tree's main pushed to its branch, and the run's log with its gradings committed to the
 * log branch and pushed, so that a tree and its record outlive the machine (J5 lost both with one). A failure to push is
 * logged and the run goes on.
 */
function publish(why) {
  if (!publishTo) return;
  const failed = [];
  try {
    git(project, 'push', '-q', publishTo.remote, `main:refs/heads/${publishTo.branch}`);
  } catch (error) {
    failed.push(`main: ${String(error.message).split('\n')[0]}`);
  }
  if (publishTo.logBranch) {
    try {
      const index = join(flowDir, `${run}.publish-index`);
      const withIndex = { ...process.env, GIT_INDEX_FILE: index };
      const plumb = (...gitArgs) =>
        execFileSync('git', gitArgs, { cwd: project, env: withIndex, encoding: 'utf8', maxBuffer: 1 << 26 }).trim();
      rmSync(index, { force: true });
      plumb('read-tree', '--empty');
      const files = [
        [log, `${run}.jsonl`],
        ...readdirSync(runDir)
          .filter(name => /^grade-.*\.json$/.test(name))
          .map(name => [join(runDir, name), `gradings/${name}`]),
      ];
      for (const [file, path] of files)
        plumb('update-index', '--add', '--cacheinfo', `100644,${plumb('hash-object', '-w', file)},${path}`);
      const tree = plumb('write-tree');
      const ref = `refs/heads/${publishTo.logBranch}`;
      let parent;
      try {
        parent = plumb('rev-parse', '--verify', '-q', ref);
      } catch {
        parent = undefined;
      }
      const commit = plumb(
        '-c',
        'user.name=flow',
        '-c',
        'user.email=flow@example.com',
        'commit-tree',
        tree,
        ...(parent ? ['-p', parent] : []),
        '-m',
        `${run}: ${why}`,
      );
      plumb('update-ref', ref, commit);
      rmSync(index, { force: true });
      git(project, 'push', '-q', publishTo.remote, `${ref}:${ref}`);
    } catch (error) {
      failed.push(`log: ${String(error.message).split('\n')[0]}`);
    }
  }
  if (failed.length) event('publish-failed', { why, failed });
}
const env = {
  ...process.env,
  PATH: pathWithThisNode(),
  YARN_IGNORE_ENGINES: 'true',
  FORCE_COLOR: '0',
  NO_COLOR: '1',
};
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
  return flatten(await cleanSteps(feature, cwd, from, { lock: alone ? replayLock : undefined }));
}

const flatten = steps => steps.flatMap(step => [`${step.name}:`, ...(step.lines ?? []).map(line => `  ${line}`)]);

/**
 * The clean arm's verdict as failing steps: the gate from the start (with --fix: the storm marked done, the documents
 * rendered), and, with `storm`, what the code still owes the feature's storm. `lock` serialises it with every other
 * holder of that lock; `without` leaves out the steps an owner of part of a feature is not judged on.
 */
async function cleanSteps(feature, cwd, from, { lock, fix = true, storm = true, without = () => false } = {}) {
  const command = `yarn -s architecture gate --base ${from} --mode architecture${fix ? ' --fix' : ''} --json`;
  const gated = parse((await sh(lock ? `flock ${lock} ${command}` : command, cwd, lock ? 3_600_000 : timeoutMs)).out);
  if (!gated) return [{ name: 'the gate did not answer', lines: [] }];
  const failing = (gated.steps ?? []).filter(step => step.status === 'fail' && !without(step));
  let owed = [];
  if (storm && hasStorm(feature)) {
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
  return [
    ...failing.map(step => ({ name: step.name, lines: step.lines ?? [] })),
    ...(owed.length ? [{ name: 'The storm still owes', lines: owed }] : []),
  ];
}

/** The hidden tests of the features up to this one, graded where no agent reads them. */
async function hidden(feature, cwd, only, ref) {
  const out = join(runDir, `grade-${feature.id}-${ref ? 'from-' : only ? 'replay-' : ''}${Date.now()}.json`);
  const graded = await sh(
    [
      `node ${grader} --project ${project} --ref ${ref ?? git(cwd, 'rev-parse', 'HEAD')} --base ${baseCommit}`,
      // M1 is the gate the attempt's verdict has just run; the ladder decides on M2 alone (grade.mjs, --gate false).
      `--kit ${kit} --upto ${feature.n} --keep false --gate false --out ${out}`,
      only ? `--only ${only.join(',')}` : '',
      clean ? (tooling ? `--tooling ${tooling}` : '') : '--control plain',
    ].join(' '),
    project,
    gradeTimeoutMs,
  );
  const report = existsSync(out) ? parse(readFileSync(out, 'utf8')) : undefined;
  if (!report) return { graded: false, lines: tail(graded.out, 30) };
  const failing = report.features.filter(each => !each.M2.pass);
  return {
    graded: true,
    failing: failing.map(each => each.feature),
    // A file that failed without naming a test (its run crashed, or was killed) still failed: it is never an empty list.
    own: failing
      .filter(each => each.feature === feature.id)
      .flatMap(each => (each.M2.failed.length ? each.M2.failed : [`${each.feature}: ${each.M2.tests}`])),
    earlier: failing.filter(each => each.feature !== feature.id).map(each => each.feature),
    report: out,
  };
}

const money = budget({ totalUsd: budgetUsd, perAgentUsd: plan.agentBudgetUsd ?? budgetUsd });
// The ceiling is the run's, not the process's: a resumed run counts what its earlier processes spent (J5: clean-3,
// resumed five times, would otherwise have had its whole budget again at each resume).
const spentBefore = logged
  .filter(each => each.event === 'agent-finished')
  .reduce((sum, each) => sum + (each.costUsd ?? 0), 0);
if (spentBefore > 0) money.settle('before this process', spentBefore);
// What each conversation (a worktree) has reported so far: a continued one reports its running total.
const reportedSoFar = new Map();
// The agents running now: one, or one per owner of a feature written in parallel.
const running = new Set();
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    for (const handle of running) handle?.stop?.();
    event('finished', { state: 'CANCELLED', costUsd: money.spent() });
    publish('cancelled');
    process.exit(130);
  });
}

/**
 * One agent turn; undefined when the budget cannot reserve one. An owner of part of a feature has a port and an
 * environment of its own (`owner`, `agentPort`, `extraEnv`).
 */
async function agent(feature, step, cwd, prompt, again, { owner, agentPort = port, extraEnv = {} } = {}) {
  const cap = money.reserve(cwd);
  if (cap === undefined) return undefined;
  let handle;
  const result = await runner.run({
    prompt,
    cwd,
    project,
    model: plan.ladder[step],
    again,
    env: { ...env, ...extraEnv, PORT: String(agentPort) },
    timeoutMs,
    maxBudgetUsd: cap,
    onProcess: child => {
      handle = child;
      running.add(child);
    },
  });
  running.delete(handle);
  money.settle(cwd, result.costUsd);
  const { report, ...figures } = result;
  if (result.costUsd !== undefined) {
    const before = again ? (reportedSoFar.get(cwd) ?? 0) : 0;
    reportedSoFar.set(cwd, result.costUsd);
    figures.conversationCostUsd = result.costUsd;
    figures.costUsd = Number(Math.max(0, result.costUsd - before).toFixed(4));
  }
  event('agent-finished', {
    feature: feature.id,
    step,
    model: plan.ladder[step],
    ...(owner && { owner }),
    ...figures,
    report,
  });
  const stopped = freePort(agentPort);
  if (stopped.length) event('port-freed', { feature: feature.id, port: agentPort, processes: stopped });
  return result;
}

/** One agent writes the feature: its verdict sent back `retries` times, then checked once more alone. */
async function writtenAlone(feature, step, from, cwd) {
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
  if (result.stoppedBy) return { reason: 'ceiling', lines: [`stopped by ${result.stoppedBy}`] };
  if (problems.length) return { reason: 'verdict', lines: problems.slice(0, 80) };
  return {};
}

const contextsTree = 'src/Contexts/';
// What every owner may write: the documents the tooling renders. The decisions (`docs/adr/`) are the feature owner's.
const generated = /^(README\.md|CLAUDE\.md|docs\/(?!adr\/).*)$/;
// The steps and the tests only the merged feature can pass: the relationship tests (ADR 33, 38). A test step is left
// out of an owner's verdict when every test it names as failing is a relationship's (`Upstream → Downstream`).
const relationshipStep = step => {
  if (step.name === 'relationships crossed' || step.name === 'relationship tests see the change') return true;
  const failed = (step.lines ?? []).map(line => line.trim()).filter(line => line.startsWith('●'));
  return failed.length > 0 && failed.every(line => line.includes('→'));
};
const slug = name => name.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase();

/**
 * The owners of a feature written in parallel: one per context its storm lists, when it lists more than one. The
 * first context owns the feature: its folder, and everything no other owner owns. Each other owner owns its folder
 * and the integration events it publishes. Listed in the order a file's owner is looked up: the feature's owner last.
 */
function ownersOf(feature) {
  if (!hasStorm(feature)) return [];
  const storm = yaml.load(readFileSync(join(kit, 'storms', `${feature.id}.yaml`), 'utf8'));
  const contexts = [...new Set((storm.contexts ?? []).map(each => each.id).filter(Boolean))];
  if (contexts.length < 2) return [];
  const [main, ...others] = contexts;
  // The relationships between two owners, from the storm's links: what one gives the other.
  const links = (storm.links ?? []).filter(
    link => contexts.includes(link.upstream) && contexts.includes(link.downstream) && link.upstream !== link.downstream,
  );
  const owners = [
    ...others.map(name => ({
      name,
      // The shared kernel names a context's events in the singular (`AccountIntegrationEvents.ts` for Accounts).
      owns: [
        `^${contextsTree}${name}/`,
        `^src/SharedKernel/.*IntegrationEvents/${name.replace(/s$/, '')}[A-Za-z]*IntegrationEvents\\.ts$`,
      ],
      says: `the ${name} context (\`${contextsTree}${name}/\`) and the integration events it publishes (\`src/SharedKernel/…/IntegrationEvents/${name.replace(/s$/, '')}IntegrationEvents.ts\`)`,
    })),
    {
      name: main,
      feature: true,
      owns: [`^${contextsTree}${main}/`, '.*'],
      says: `the ${main} context (\`${contextsTree}${main}/\`) and everything no other owner owns: the composition root, the shared kernel, the conventions, and the decisions under \`docs/adr/\` (a context or a relationship declared, an ADR)`,
    },
  ];
  return owners.map(owner => ({ ...owner, links }));
}

/**
 * Who does what across a relationship between two owners: the upstream writes the contract first and says so; the
 * downstream builds on it, and writes the relationship's test, which finds the thing downstream by the id the upstream
 * answered (ADR 33). Without it, J5's two developers waited on each other, and a test across two owners was nobody's.
 */
const contractsBetween = (team, teams) => {
  const links = team.links ?? [];
  if (!links.length) return [];
  const contract = link =>
    link.mechanism === 'integration-event'
      ? `the integration event${(link.contracts ?? []).length > 1 ? 's' : ''} ${(link.contracts ?? []).map(name => `\`${name}\``).join(', ')} in the shared kernel, with the id of the thing it announces and every field the ${link.downstream} side needs`
      : `what the ${link.upstream} side answers the ${link.downstream} side's port ${(link.contracts ?? []).map(name => `\`${name}\``).join(', ')} with (the read model the adapter reads)`;
  return [
    '**The contracts between you.**',
    ...links.map(link => {
      const role =
        team.name === link.upstream
          ? 'You write it first, commit it, and say in the channel that it is there, with its fields.'
          : team.name === link.downstream
            ? `You build on it once the ${link.upstream} owner says it is there; you do not write your own version of it. The relationship's test (named \`${link.upstream} → ${link.downstream}\`, in your context's end-to-end tests) is yours: it makes the thing on the ${link.upstream} side and finds it on yours, through the API, by the id the ${link.upstream} side answered.`
            : 'It is not yours; read it on their branches.';
      return `- ${link.upstream} → ${link.downstream}: ${contract(link)}. ${role}`;
    }),
    `${teams.length > 2 ? 'Any other contract between you is agreed in the channel the same way: the side that gives it writes it first.' : ''}`,
    '',
  ].filter((line, index, all) => line !== '' || index === all.length - 1);
};

/** The channel the owners of one attempt talk through: one append-only file, one command on their PATH. */
function channel(dir) {
  mkdirSync(join(dir, 'bin'), { recursive: true });
  const file = join(dir, 'channel.log');
  writeFileSync(file, '');
  // A resumed attempt starts a new channel: what an owner had read of the old one would hide the new one's first lines.
  for (const seen of readdirSync(dir).filter(name => name.startsWith('.seen-')))
    rmSync(join(dir, seen), { force: true });
  const script = join(dir, 'bin', 'channel');
  writeFileSync(
    script,
    `#!/bin/bash
# channel say <text> | channel wait [seconds] | channel read
F=${file}; SEEN=${dir}/.seen-$TEAM
case "$1" in
  say) shift; echo "[$(date -u +%T) $TEAM] $*" >> "$F"; wc -l < "$F" > "$SEEN"; echo "said";;
  read) cat "$F"; wc -l < "$F" > "$SEEN";;
  wait) s=\${2:-100}; [ "$s" -gt 100 ] && s=100; seen=$(cat "$SEEN" 2>/dev/null || echo 0); end=$(( $(date +%s) + s ))
    while [ "$(date +%s)" -lt $end ]; do
      new=$(tail -n +$((seen + 1)) "$F" | grep -v "^\\[[0-9:]* $TEAM\\]")
      if [ -n "$new" ]; then echo "$new"; wc -l < "$F" > "$SEEN"; exit 0; fi
      sleep 2
    done; echo "(nothing new from the others in \${s} s; call channel wait again to keep waiting)";;
  *) echo "usage: channel say <text> | channel wait [seconds] | channel read"; exit 2;;
esac
`,
  );
  chmodSync(script, 0o755);
  return { bin: join(dir, 'bin'), file };
}

const ownerBrief = (feature, from, storm, team, teams) =>
  [
    opening(feature),
    'Read `CLAUDE.md` first and follow it. Do not ask questions of the user: decide, and say in your final report what was unclear.',
    '',
    `The feature's storm, decided with the product's owner before you started, is \`conventions/storms/${feature.id}.yaml\`: its hot spots are decided, do not change them. \`yarn architecture storm --expect conventions/storms/${feature.id}.yaml\` says what the code still owes it.`,
    '',
    `**You are one of ${teams.length} agents writing this feature at the same time, one per context it changes.** You are the ${team.name} owner, on the branch \`${team.branch}\`. You own ${team.says}. ${teams
      .filter(other => other !== team)
      .map(other => `The ${other.name} owner owns ${other.says}, on the branch \`${other.branch}\`.`)
      .join(' ')} The driver refuses a change to a file you do not own: what you need there, ask its owner for.`,
    '',
    '**Talking to the other owners.** Only through the channel:',
    '- `channel say "<text>"` writes to it;',
    '- `channel wait` waits until another owner writes (100 seconds at most per call; call it again to wait longer) and prints what was written;',
    '- `channel read` prints everything said so far.',
    `Their work is on their branches, in this same repository: \`git log <branch>\`, \`git show <branch>:<path>\`, \`git diff ${storm}..<branch>\`. Never commit on a branch but yours. When you rely on something another context gives (an event, its payload, a port, an id), agree its shape in the channel first.`,
    '',
    ...contractsBetween(team, teams),
    `You are done when \`yarn architecture gate --base ${from} --mode architecture\` passes on your branch, apart from the relationship tests, which only the merged feature can pass, and from what is another owner's: then say so in the channel and in your final report. Commit your work on the current branch; do not push. If you start a server, use port ${team.port}.`,
    "Then the integrator merges every owner's branch, runs the gate on the result, and sends each failure to the owner of the files it names.",
    '',
    feature.kind === 'report'
      ? "The report, in the user's words:"
      : 'The feature, in product words, with the API it answers:',
    '',
    request(feature),
  ].join('\n');

/**
 * One agent per owner writes the feature, in parallel, each on its own branch from the storm's commit; then the
 * integrator (integrator.mjs) merges them in `cwd` and holds the merged result to the clean arm's verdict.
 */
async function writtenByOwners(feature, step, from, cwd, id, owners) {
  const storm = git(cwd, 'rev-parse', 'HEAD');
  const talk = channel(join(runDir, `${id}.channel`));
  const gateLock = join(runDir, `${id}.gate.lock`);
  const teams = owners.map((owner, index) => ({
    ...owner,
    cwd: join(runDir, `${id}-${slug(owner.name)}`),
    branch: `run/${run}/${id}-${slug(owner.name)}`,
    port: port + 1 + index,
  }));
  const featureOwner = teams.find(team => team.feature).name;
  const options = team => ({
    owner: team.name,
    agentPort: team.port,
    extraEnv: { PATH: `${talk.bin}:${env.PATH}`, TEAM: team.name },
  });
  for (const team of teams) {
    if (existsSync(team.cwd)) git(project, 'worktree', 'remove', '--force', team.cwd);
    git(project, 'worktree', 'add', '-q', '-B', team.branch, team.cwd, storm);
    provideDependencies(project, team.cwd, dependencies);
  }
  let budgetOut = false;
  let ceiling;
  try {
    /** An owner's verdict: its scope, and the gate on its branch without the relationship tests. */
    const ownerVerdict = async team => {
      commitAll(team.cwd, `${feature.id}: ${team.name}'s work left uncommitted`);
      // A file another owner owns is out of scope, unless it is that owner's own version (a branch merged in).
      const blob = (ref, file) => {
        try {
          return git(team.cwd, 'rev-parse', `${ref}:${file}`);
        } catch {
          return 'absent';
        }
      };
      const outside = git(team.cwd, 'diff', '--name-only', storm, 'HEAD')
        .split('\n')
        .filter(Boolean)
        .filter(file => !generated.test(file))
        .filter(file => {
          const owner = teams.find(each => each.name === ownerOf(file, teams));
          return owner !== team && blob('HEAD', file) !== blob(owner.branch, file);
        });
      const steps = await cleanSteps(feature, team.cwd, from, {
        lock: gateLock,
        fix: false,
        storm: false,
        without: relationshipStep,
      });
      return [
        ...(outside.length
          ? [
              'Files another owner owns (undo your change to them, or ask their owner in the channel):',
              ...outside.map(file => `  ${file}`),
            ]
          : []),
        ...flatten(steps),
      ];
    };
    const work = async team => {
      let result = await agent(
        feature,
        step,
        team.cwd,
        ownerBrief(feature, from, storm, team, teams),
        false,
        options(team),
      );
      if (!result) return { budget: true };
      let problems = result.stoppedBy ? [] : await ownerVerdict(team);
      for (let turn = 0; !result.stoppedBy && problems.length && turn < retries; turn++) {
        result = await agent(feature, step, team.cwd, feedback(problems), true, options(team));
        if (!result) return { budget: true };
        if (!result.stoppedBy) problems = await ownerVerdict(team);
      }
      commitAll(team.cwd, `${feature.id}: ${team.name}'s work left uncommitted`);
      event('owner-verdict', {
        feature: feature.id,
        step,
        owner: team.name,
        pass: problems.length === 0,
        lines: problems.slice(0, 40),
        ...(result.stoppedBy && { stoppedBy: result.stoppedBy }),
      });
      return { result };
    };
    const worked = await Promise.all(teams.map(work));
    if (worked.some(each => each.budget)) return { reason: 'budget' };
    ceiling = worked.find(each => each.result.stoppedBy)?.result.stoppedBy;
    if (ceiling) return { reason: 'ceiling', lines: [`an owner was stopped by ${ceiling}`] };

    const order = [...teams.filter(team => !team.feature), teams.find(team => team.feature)];
    const merge = async () => {
      git(cwd, 'reset', '-q', '--hard', storm);
      git(cwd, 'clean', '-fdq');
      for (const team of order) {
        try {
          git(
            cwd,
            '-c',
            'user.name=flow',
            '-c',
            'user.email=flow@example.com',
            'merge',
            '--no-ff',
            '-q',
            '-m',
            `Merge ${team.name}'s part`,
            team.branch,
          );
        } catch {
          const files = git(cwd, 'diff', '--name-only', '--diff-filter=U').split('\n').filter(Boolean);
          // Documents the tooling renders conflict when two owners rendered them: either side does, the gate renders
          // them again with --fix.
          if (files.length && files.every(file => generated.test(file))) {
            for (const file of files) git(cwd, 'checkout', '--ours', '--', file);
            git(cwd, 'add', '--', ...files);
            git(
              cwd,
              '-c',
              'user.name=flow',
              '-c',
              'user.email=flow@example.com',
              'commit',
              '-qm',
              `Merge ${team.name}'s part`,
            );
            continue;
          }
          git(cwd, 'merge', '--abort');
          return { conflict: { owner: team.name, files } };
        }
      }
      return {};
    };
    const gate = async () => {
      commitAll(cwd, `${feature.id}: merged`);
      const steps = await cleanSteps(feature, cwd, from);
      commitAll(cwd, `${feature.id}: the gate's bookkeeping`);
      return { pass: steps.length === 0, steps };
    };
    const send = async (name, kind, lines) => {
      const team = teams.find(each => each.name === name);
      const others = teams.filter(each => each !== team).map(each => `\`${each.branch}\``);
      const message =
        kind === 'conflict'
          ? [
              `The integrator could not merge your branch with the other owners' (${others.join(', ')}). It conflicts in:`,
              '',
              ...lines.map(file => `  ${file}`),
              '',
              `Merge their branches into yours (\`git merge <branch>\`), resolve the conflicts, keep the gate passing on your branch, and commit. Read the channel first (\`channel read\`).`,
            ]
          : [
              `The integrator merged every owner's branch and ran the gate on the result. These failures name files you own${team.feature ? ', or no owner’s file, and the feature is yours' : ''}:`,
              '',
              ...lines,
              '',
              `Read the channel first (\`channel read\`): another owner may have asked you for something. Merge the other owners' branches into yours if you need their work to reproduce it (${others.join(', ')}), fix what is yours, commit, and tell the others in the channel what you changed that they rely on.`,
            ];
      const result = await agent(feature, step, team.cwd, message.join('\n'), true, options(team));
      if (!result) budgetOut = true;
      else if (result.stoppedBy) ceiling = result.stoppedBy;
      commitAll(team.cwd, `${feature.id}: ${team.name}'s work left uncommitted`);
    };
    // A relationship's step names no file of its own; its test is the downstream owner's (ADR 33): the pairs it names
    // (`Upstream → Downstream`) say whose. J5b's 56 sent it to the feature's owner three rounds running.
    const routeStep = step =>
      /^relationship/.test(step.name)
        ? [
            ...new Set(
              (step.lines ?? []).flatMap(line =>
                [...String(line).matchAll(/(\w+) → (\w+)/g)].map(([, , downstream]) => downstream),
              ),
            ),
          ]
        : [];
    const integrated = await integrate({
      owners: teams,
      featureOwner,
      routeStep,
      merge,
      gate,
      send,
      rounds: fanOut.rounds ?? 2,
      log: (name, data) => event(name, { feature: feature.id, step, ...data }),
    });
    event('integrated', {
      feature: feature.id,
      step,
      pass: integrated.pass,
      rounds: integrated.rounds.length,
      channel: readFileSync(talk.file, 'utf8').split('\n').filter(Boolean).length,
    });
    if (budgetOut) return { reason: 'budget' };
    if (integrated.pass) return {};
    if (integrated.conflict)
      return {
        reason: 'verdict',
        lines: [
          `The owners' branches still conflict (${integrated.conflict.owner}'s):`,
          ...integrated.conflict.files.map(file => `  ${file}`),
        ],
      };
    // As one agent's verdict is: checked once more alone before it counts.
    const first = Object.values(integrated.left ?? {}).flat();
    const again = await cleanSteps(feature, cwd, from, { lock: replayLock });
    commitAll(cwd, `${feature.id}: the gate's bookkeeping`);
    event('verdict-replayed', {
      feature: feature.id,
      step,
      first: first.slice(0, 40),
      still: flatten(again).slice(0, 40),
    });
    if (again.length) return { reason: ceiling ? 'ceiling' : 'verdict', lines: flatten(again).slice(0, 80) };
    return {};
  } finally {
    // The owners' branches keep their work; their worktrees and dependencies go, as an attempt's do.
    for (const team of teams) if (existsSync(team.cwd)) git(project, 'worktree', 'remove', '--force', team.cwd);
  }
}

/** One attempt at one step of the ladder: its agent (or its owners'), the verdict sent back, the hidden tests. */
async function attempt(feature, step, from, { single = false } = {}) {
  const id = `${feature.id}-${step}${single ? '-one' : ''}`;
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
  const owners = fanOut && !single ? ownersOf(feature) : [];
  event('attempt', {
    feature: feature.id,
    step,
    model: plan.ladder[step],
    from,
    tree: size(cwd),
    ...(owners.length && { owners: owners.map(owner => owner.name) }),
    ...(single && { control: 'one agent' }),
  });
  // What `clean-ddd strategy` recommends for this feature, logged beside what this attempt does (RFC 0001, phase 6),
  // so that the split's results calibrate the rule; tooling older than the command logs nothing.
  if (fanOut && hasStorm(feature)) {
    const advice = parse(
      (
        await sh(
          `yarn -s architecture strategy --storm conventions/storms/${feature.id}.yaml --priority cost --json`,
          cwd,
          120_000,
        )
      ).out,
    );
    if (advice?.strategy)
      event('strategy', {
        feature: feature.id,
        step,
        ran: owners.length ? 'fan-out-by-context' : 'one agent',
        recommended: advice.strategy,
        estimate: advice.estimate,
        inputs: advice.inputs,
      });
  }
  const written = owners.length
    ? await writtenByOwners(feature, step, from, cwd, id, owners)
    : await writtenAlone(feature, step, from, cwd);
  const wallClockMs = Date.now() - begun;
  if (written.reason === 'budget') return written;
  if (written.reason) return { ...written, cwd, wallClockMs };
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
  // With `regressionCheck`, an earlier feature that still fails is graded on the commit this attempt started from: one
  // that fails there too was unstable before the attempt (J5's test 71 met a job that had not run yet, on a tree whose
  // rule was right), and is kept for the triage rather than escalated. Only what passed on the start is a regression.
  let unstable = [];
  if (tests.earlier.length && regressionCheck) {
    const gradings = [];
    for (let time = 0; time < regressionCheck.from; time++)
      gradings.push(await hidden(feature, cwd, tests.earlier, from));
    const judged = regressionsAgainstFrom(tests.earlier, gradings);
    event('regressions-on-from', {
      feature: feature.id,
      step,
      from,
      earlier: tests.earlier,
      regression: judged.regression,
      unstable: judged.unstable,
      reports: gradings.map(grading => grading.report).filter(Boolean),
    });
    unstable = judged.unstable;
    tests = { ...tests, earlier: judged.regression };
  }
  if (tests.earlier.length)
    return { reason: 'regression', cwd, wallClockMs, lines: tests.earlier, report: tests.report };
  return { reason: undefined, cwd, wallClockMs, report: tests.report, ...(unstable.length && { unstable }) };
}

// A resumed run keeps the commit it started from: its main has moved since, and the grader compares the dependencies,
// and the gate the changes, with this commit.
const baseCommit = before.find(each => each.event === 'started')?.baseCommit ?? git(project, 'rev-parse', plan.base);
// A grading a crash interrupted leaves its worktree, with every hidden test in it, beside the trees the agents work in
// (J5b: a container restart mid-grading). Each start removes what the grader would have removed.
const gradings = join(flowDir, 'grade');
if (existsSync(gradings))
  for (const name of readdirSync(gradings)) {
    const left = join(gradings, name);
    try {
      git(project, 'worktree', 'remove', '--force', left);
    } catch {
      rmSync(left, { recursive: true, force: true });
    }
  }
await takeSlot({
  max: ladderSlots,
  onWait: () => event('waiting-for-slot', { ladders: ladderSlots }),
});
const started = Date.now();
event(resuming ? 'resumed' : 'started', {
  node: process.versions.node,
  arm: plan.arm,
  project,
  baseCommit,
  runner: runner.name,
  ladder: plan.ladder,
  budgetUsd,
  ...(spentBefore > 0 && { spentBeforeUsd: Number(spentBefore.toFixed(4)) }),
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
      publish(`${feature.id} escalated at step ${step}`);
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
      // Earlier features that failed here and on the start too: delivered, and owed a look at the kit (triage.md).
      ...(tried.unstable && { unstable: tried.unstable }),
    });
    publish(`${feature.id} delivered at step ${step}`);
  }
  // A feature written by its owners that every step failed is written once more by one agent, with the last model,
  // before the triage: if one agent delivers it, the split failed, not the tree, and the tree goes on; the control is
  // counted apart (`control`, and `control: 'one agent'` on the delivery). Once per feature, across resumes.
  let byOneAgent = false;
  if (
    deliveredAt === undefined &&
    !stopped &&
    fanOut &&
    ownersOf(feature).length &&
    !before.some(each => each.event === 'control' && each.feature === feature.id)
  ) {
    const step = plan.ladder.length - 1;
    const tried = await attempt(feature, step, from, { single: true });
    if (tried.reason === 'budget') {
      event('budget', { feature: feature.id, step, spentUsd: money.spent(), budgetUsd });
      stopped = true;
    } else {
      const head = tried.cwd ? git(tried.cwd, 'rev-parse', 'HEAD') : undefined;
      if (tried.cwd) git(project, 'worktree', 'remove', '--force', tried.cwd);
      event('control', {
        feature: feature.id,
        step,
        model: plan.ladder[step],
        written: 'one agent',
        delivered: !tried.reason,
        ...(tried.reason && { reason: tried.reason, lines: tried.lines }),
        head,
        report: tried.report,
      });
      if (!tried.reason) {
        git(project, 'merge', '-q', '--ff-only', head);
        deliveredAt = step;
        byOneAgent = true;
        event('delivered', {
          feature: feature.id,
          step,
          model: plan.ladder[step],
          control: 'one agent',
          head: git(project, 'rev-parse', 'main'),
          report: tried.report,
          ...(tried.unstable && { unstable: tried.unstable }),
        });
        publish(`${feature.id} delivered by one agent, the control`);
      } else publish(`${feature.id}: the control failed too`);
    }
  }
  if (deliveredAt !== undefined)
    outcomes[feature.id] = `DELIVERED at step ${deliveredAt}${byOneAgent ? ' by one agent (the control)' : ''}`;
  else if (stopped) outcomes[feature.id] = 'NOT STARTED';
  else {
    // The last model failed too: the tree stops, and a maintainer calls it FAILED, or the kit's, by the
    // rule written before the runs (the kit's triage.md), from what this note gathers.
    outcomes[feature.id] = 'NEEDS TRIAGE';
    event('needs-triage', { feature: feature.id, ...(await triage(feature)) });
    publish(`${feature.id} needs triage`);
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
publish('finished');
process.exit(all ? 0 : 1);
