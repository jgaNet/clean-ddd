#!/usr/bin/env node
/**
 * A whole backlog, delivered by arm A or arm B of the benchmark (RFC 0001 §10, phase 4).
 *
 *   node .claude/flow/run-backlog.mjs --project <dir> --plan <execution-plan.yaml>
 *
 *   run: pilot-a
 *   arm: A                      # A: one agent takes the backlog in order; B: one agent per feature;
 *                               # P and D: the control arms, one agent in order, no storm, no gate
 *   kit: ../../docs/evaluations/benchmark   # the backlog, the storms; relative to this file
 *   base: main                  # the created commit
 *   agent: { runner: claude-cli, timeoutMinutes: 90 }   # and `model: <id>`
 *   parallelism: 3              # B only: features at once
 *   retry: { perFeature: 1 }
 *   budgetUsd: 40
 *   agentBudgetUsd: 10          # optional: the most one agent may spend, reserved before it starts (default: budgetUsd)
 *   dependencies: copy          # copy (default): each worktree its own node_modules; link: hard links, checked after each agent
 *   ports: { base: 18100 }
 *   brief: '…'                  # optional: a paragraph added to every brief (E2: the contract a fan-out had)
 *   priority: cost              # what `clean-ddd strategy` weighs, logged beside each feature (cost | time)
 *
 * Arm A — one agent. One conversation takes the features in order. For each: the driver puts the
 * feature's storm, decided before the run, into the project and commits it; the agent writes the
 * feature, an architecture task included when the feature needs one (no person is beside it);
 * the driver's verdict is the gate in the architecture mode from the commit the feature started
 * at, and the storm owing nothing. A failure goes back to the agent once, with the lines.
 *
 * Arm B — naive parallel. One fresh agent per feature, in a worktree from the integrated head of
 * when it starts; a feature starts once the features it needs are integrated, as many at once as
 * `parallelism` allows; no contract stage, no conflict keys. The driver's verdict is the same as
 * A's. Then the integrator, one feature at a time: the feature's patch on the integrated head,
 * the documents regenerated, the gate on the combination. A git conflict, or a gate that fails
 * on the combination, sends the feature back once: the integrated head is merged into its
 * worktree, conflicts and all, and its agent resolves them in the same conversation.
 *
 * Arms P and D — the control (docs/evaluations/benchmark/control). One conversation takes the
 * features in order, as in A, on a project `control.mjs` made: P a plain TypeScript project, D the
 * architecture with its tooling taken out. The agent is given the request alone, no storm; the
 * driver's verdict is the project's own `yarn verify` (typecheck, lint, format, tests), one retry.
 *
 * Every step is appended to `<project>.flow/<run>.jsonl`. The budget is reserved before an agent
 * starts (supervision.mjs): an agent runs with a cap it may not spend past, and a run that cannot
 * reserve one starts no more agents and ends FAILED. After each agent, whatever still listens on
 * its port is stopped and recorded. With `dependencies: link`, a file the agent wrote into the
 * project's node_modules through a link fails the feature. The integrated head is the project's
 * `main`. Processes are controlled by process group, never by name.
 */
import { execFileSync, spawn } from 'node:child_process';
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';

import { runners } from './runners.mjs';
import { budget, DEPENDENCY_MODES, fingerprint, freePort, provideDependencies } from './supervision.mjs';

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
for (const key of ['run', 'arm', 'kit', 'base']) if (!plan[key]) fail(`${planFile}: ${key} is required`);
if (!['A', 'B', 'P', 'D'].includes(plan.arm))
  fail(`${planFile}: arm is A, B, P or D; C and C′ run feature by feature (run-slices.mjs)`);
/** One conversation, the features in order. */
const sequential = plan.arm !== 'B';
/** The clean-ddd tooling is in the project: storms, the gate, the strategy. */
const tooled = plan.arm === 'A' || plan.arm === 'B';
const run = plan.run;
const kit = resolve(dirname(planFile), plan.kit);
const backlog = yaml.load(readFileSync(join(kit, 'backlog/backlog.yaml'), 'utf8')).features;
const model = plan.agent?.model;
const runner = runners[plan.agent?.runner ?? 'claude-cli'];
const timeoutMs = (plan.agent?.timeoutMinutes ?? 90) * 60_000;
const parallelism = sequential ? 1 : (plan.parallelism ?? 3);
const retries = plan.retry?.perFeature ?? 1;
const budgetUsd = plan.budgetUsd ?? 40;
const dependencies = plan.dependencies ?? 'copy';
if (!DEPENDENCY_MODES.includes(dependencies)) fail(`${planFile}: dependencies is ${DEPENDENCY_MODES.join(' or ')}`);
const portBase = plan.ports?.base ?? 18100;

const flowDir = `${project}.flow`;
const runDir = join(flowDir, 'worktrees', run);
const log = join(flowDir, `${run}.jsonl`);
mkdirSync(runDir, { recursive: true });
// `--resume` continues a sequential run its driver lost (a container restarted): the features it
// finished stay finished, and the one it was writing is continued in the same conversation.
const resuming = args.includes('--resume');
if (resuming && plan.arm === 'B') fail('--resume continues a sequential run (A, P, D)');
const before =
  resuming && existsSync(log)
    ? readFileSync(log, 'utf8')
        .trim()
        .split('\n')
        .map(line => JSON.parse(line))
    : [];
if (existsSync(log) && !resuming) fail(`${log} exists: a run id is used once`);
const finishedBefore = new Set(
  before.filter(entry => entry.event === 'feature' && entry.state === 'COMPLETED').map(entry => entry.feature),
);

const event = (name, data = {}) => {
  const line = { run, event: name, at: new Date().toISOString(), ...data };
  appendFileSync(log, `${JSON.stringify(line)}\n`);
  process.stdout.write(
    `${line.at.slice(11, 19)} ${name}${data.feature ? ` ${data.feature}` : ''}${data.state ? ` → ${data.state}` : ''}${data.kind ? ` (${data.kind})` : ''}\n`,
  );
  return line;
};
const git = (cwd, ...gitArgs) =>
  execFileSync('git', gitArgs, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).trim();
const tryGit = (cwd, ...gitArgs) => {
  try {
    return { ok: true, out: git(cwd, ...gitArgs) };
  } catch (error) {
    return { ok: false, out: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
};
const commitAll = (cwd, message) => {
  git(cwd, 'add', '-A');
  if (!git(cwd, 'status', '--porcelain')) return false;
  git(cwd, '-c', 'user.name=flow', '-c', 'user.email=flow@example.com', 'commit', '-qm', message);
  return true;
};
const env = { ...process.env, YARN_IGNORE_ENGINES: 'true', FORCE_COLOR: '0', NO_COLOR: '1' };
function exec(command, commandArgs, { cwd, timeout = timeoutMs } = {}) {
  return new Promise(done => {
    const child = spawn(command, commandArgs, { cwd, env, detached: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => (stdout += chunk));
    child.stderr.on('data', chunk => (stderr += chunk));
    const timer = setTimeout(() => {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        // already gone
      }
    }, timeout);
    child.on('close', code => {
      clearTimeout(timer);
      done({ code, stdout, stderr });
    });
  });
}
const sh = (command, cwd, timeout) => exec('sh', ['-c', command], { cwd, timeout });
const tail = (text, count = 40) =>
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
const tool = 'yarn -s architecture';

const baseCommit = git(project, 'rev-parse', plan.base);
const started = Date.now();
if (resuming) event('resumed', { finished: [...finishedBefore] });
else event('started', { arm: plan.arm, project, baseCommit, runner: runner.name, model, parallelism, budgetUsd });

/** A worktree beside the project, at a commit, with its dependencies as the plan says (copied by default). */
function worktree(id, at) {
  const path = join(runDir, id);
  git(project, 'worktree', 'add', '-q', '-b', `run/${run}/${id}`, path, at);
  provideDependencies(project, path, dependencies);
  return path;
}

/** A feature that adds no command, event or policy (persistence) has no storm. */
const hasStorm = feature => existsSync(join(kit, 'storms', `${feature.id}.yaml`));

/** The feature's storm, decided before the run, put where the agent and the check read it. */
function placeStorm(feature, cwd) {
  if (!hasStorm(feature)) return;
  const target = join(cwd, 'conventions/storms', `${feature.id}.yaml`);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(join(kit, 'storms', `${feature.id}.yaml`), target);
  commitAll(cwd, `storm: ${feature.id}, decided before the run`);
}

/**
 * What `clean-ddd strategy` recommends for the feature, logged beside what this arm does with it
 * (RFC 0001, phase 6: a rule is evaluated against the runs it was asked about). Tooling older than
 * the command logs nothing.
 */
async function logStrategy(feature, cwd) {
  const storm = `conventions/storms/${feature.id}.yaml`;
  const advice = parse(
    (await sh(`${tool} strategy --storm ${storm} --priority ${plan.priority ?? 'cost'} --json`, cwd, 120_000)).stdout,
  );
  if (advice?.strategy) {
    const { strategy: recommended, estimate, inputs } = advice;
    event('strategy', { feature: feature.id, arm: plan.arm, recommended, estimate, inputs });
  }
}

/** The driver's verdict on a feature in a tree: the gate from where it started, and the storm. */
async function verdict(feature, cwd, from) {
  if (commitAll(cwd, `${feature.id}: work the agent left uncommitted`))
    event('committed-leftovers', { feature: feature.id });
  const begun = Date.now();
  if (!tooled) {
    // The control arms: the project's own checks, as its guide says.
    const checked = await sh('yarn -s verify', cwd, 900_000);
    const problems = checked.code === 0 ? [] : ['`yarn verify` fails:', ...tail(checked.stdout + checked.stderr, 60)];
    event('gate', {
      feature: feature.id,
      verdict: checked.code === 0 ? 'pass' : 'fail',
      steps: [['yarn verify', checked.code === 0 ? 'pass' : 'fail']],
      wallClockMs: Date.now() - begun,
      lines: problems.slice(0, 80),
    });
    return problems;
  }
  // --fix: the bookkeeping (a carried storm marked done, stale documents) is the tooling's, not a turn of the agent's.
  const gated = parse((await sh(`${tool} gate --base ${from} --mode architecture --fix --json`, cwd)).stdout);
  const failing = (gated?.steps ?? []).filter(step => step.status === 'fail');
  // The kit's storm held as done: whatever the code does not carry yet is a difference.
  let owed = [];
  if (hasStorm(feature)) {
    const done = join(runDir, 'storms', `${feature.id}.yaml`);
    mkdirSync(dirname(done), { recursive: true });
    writeFileSync(
      done,
      readFileSync(join(kit, 'storms', `${feature.id}.yaml`), 'utf8').replace(/^done: false$/m, 'done: true'),
    );
    const storm = parse((await sh(`${tool} storm --expect ${done} --json`, cwd, 300_000)).stdout);
    owed = storm?.problems ?? ['the storm could not be read'];
  }
  const problems = [
    ...failing.flatMap(step => [`${step.name}:`, ...(step.lines ?? []).map(line => `  ${line}`)]),
    ...(owed.length ? ['The storm still owes:', ...owed.map(line => `  ${line}`)] : []),
  ];
  event('gate', {
    feature: feature.id,
    verdict: gated?.verdict ?? 'unreadable',
    steps: gated?.steps?.map(step => [step.name, step.status]),
    owed: owed.length,
    wallClockMs: Date.now() - begun,
    lines: problems.slice(0, 80),
  });
  return problems;
}

// The agents, their conversations (cwd → the latest cost reported in it), and what they reported.
const money = budget({ totalUsd: budgetUsd, perAgentUsd: plan.agentBudgetUsd ?? budgetUsd });
const running = new Map();
let overBudget = false;
const spent = () => money.spent();

async function agent(feature, cwd, prompt, again, port) {
  const cap = money.reserve(cwd);
  if (cap === undefined) {
    overBudget = true;
    event('budget', { feature: feature.id, spentUsd: spent(), reservedUsd: money.reserved(), budgetUsd });
    return undefined;
  }
  event('feature', { feature: feature.id, state: 'RUNNING', again: Boolean(again), reservedUsd: cap });
  const before = dependencies === 'link' ? fingerprint(join(project, 'node_modules')) : undefined;
  const result = await runner.run({
    prompt,
    cwd,
    project,
    model,
    again,
    env: { ...env, PORT: String(port) },
    timeoutMs,
    maxBudgetUsd: cap,
    onProcess: handle => running.set(feature.id, handle),
  });
  running.delete(feature.id);
  // A continued conversation reports its running total: the latest figure is the conversation's.
  money.settle(cwd, result.costUsd);
  event('agent-finished', { feature: feature.id, runner: runner.name, ...result });
  // What the agent left running on its port (a server started in the background) is stopped.
  const stopped = freePort(port);
  if (stopped.length) event('port-freed', { feature: feature.id, port, processes: stopped });
  if (before !== undefined && fingerprint(join(project, 'node_modules')) !== before) {
    event('dependencies-changed', { feature: feature.id });
    return { ...result, dependenciesChanged: true };
  }
  return result;
}

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    for (const handle of running.values()) handle.stop?.();
    event('finished', { state: 'CANCELLED', costUsd: spent(), leadTimeMs: Date.now() - started });
    process.exit(130);
  });
}

const request = feature => readFileSync(join(kit, 'backlog', `${feature.n}-${feature.id}.md`), 'utf8').trim();
const controlBrief = (feature, port) =>
  [
    plan.arm === 'D'
      ? `You are writing an application built on Clean Architecture and Domain-Driven Design, one feature at a time, in this conversation. This is feature ${feature.n} of ${Math.max(...backlog.map(each => each.n))}.`
      : `You are writing an application, one feature at a time, in this conversation. This is feature ${feature.n} of ${Math.max(...backlog.map(each => each.n))}.`,
    'Read `CLAUDE.md` first and follow it. Do not ask questions: decide, and say in your final report what was unclear.',
    '',
    `You are done when \`yarn verify\` passes. Commit your work on the current branch; do not push. If you start a server, use port ${port}.`,
    '',
    'The feature, in product words, with the API it answers:',
    '',
    request(feature),
  ].join('\n');
const brief = (feature, from, port) =>
  !tooled
    ? controlBrief(feature, port)
    : [
        plan.arm === 'A'
          ? `You are writing an application built on the clean-ddd architecture, one feature at a time, in this conversation. This is feature ${feature.n} of ${Math.max(...backlog.map(each => each.n))}.`
          : `You are writing one feature of an application built on the clean-ddd architecture. Other agents are writing other features at the same time, each in its own git worktree; you will not see their work, which is integrated with yours afterwards.`,
        'Read `CLAUDE.md` first and follow it. Do not ask questions: decide, and say in your final report what was unclear.',
        '',
        ...(hasStorm(feature)
          ? [
              `The feature's storm, decided with the product's owner before you started, is \`conventions/storms/${feature.id}.yaml\`: its hot spots are decided, do not change them. \`yarn architecture storm --expect conventions/storms/${feature.id}.yaml\` says what the code still owes it; once it owes nothing, \`yarn architecture gate --fix\` marks it done.`,
            ]
          : []),
        'If the feature needs a context or a relationship between contexts that the application does not have yet, that is an architecture task, and it is yours: declare it, record the decision in an ADR under `docs/adr/`, then write the feature (`yarn architecture mode architecture` says what that takes).',
        `You are done when \`yarn architecture gate --base ${from} --mode architecture --fix\` passes${hasStorm(feature) ? ' and the storm owes nothing' : ''}; \`--fix\` does the bookkeeping (a storm the code carries marked done, the documents rendered again). Commit your work on the current branch; do not push. If you start a server, use port ${port}.`,
        // What the execution plan adds for this run (the contract a fan-out would have had, E2).
        ...(plan.brief ? ['', String(plan.brief).trim()] : []),
        '',
        'The feature, in product words, with the API it answers:',
        '',
        request(feature),
      ].join('\n');
const feedback = lines =>
  `The driver checked your work and it is not done:\n\n${lines.join('\n')}\n\nFix it, then commit. ${tooled ? 'The storm and the request are unchanged.' : 'The request is unchanged.'}`;

/** Write one feature in a tree and hold it to the verdict; one retry. */
async function deliver(feature, cwd, from, port, { again = false, continuing = false } = {}) {
  const prompt = continuing
    ? `You were interrupted while writing this feature: the machine restarted. What you had written is in the worktree; continue from there.\n\n${brief(feature, from, port)}`
    : brief(feature, from, port);
  let result = await agent(feature, cwd, prompt, again, port);
  if (!result) return { ok: false, reason: 'budget' };
  if (result.dependenciesChanged) return { ok: false, reason: 'dependencies' };
  let problems = await verdict(feature, cwd, from);
  for (let attempt = 0; problems.length && attempt < retries; attempt++) {
    result = await agent(feature, cwd, feedback(problems), true, port);
    if (!result) return { ok: false, reason: 'budget' };
    if (result.dependenciesChanged) return { ok: false, reason: 'dependencies' };
    problems = await verdict(feature, cwd, from);
  }
  return { ok: !problems.length, problems };
}

const outcomes = {};

if (sequential) {
  // One worktree, one conversation, the features in order.
  const cwd = resuming ? join(runDir, plan.arm.toLowerCase()) : worktree(plan.arm.toLowerCase(), baseCommit);
  let interrupted = resuming;
  for (const [index, feature] of backlog.entries()) {
    if (finishedBefore.has(feature.id)) {
      outcomes[feature.id] = 'COMPLETED';
      continue;
    }
    if (overBudget) {
      outcomes[feature.id] = 'NOT STARTED';
      continue;
    }
    // The feature an interrupted run was writing: its storm is placed already, its start is the
    // commit after the last feature it finished.
    const continuing = interrupted && before.some(entry => entry.event === 'feature' && entry.feature === feature.id);
    if (tooled && !continuing) {
      placeStorm(feature, cwd);
      await logStrategy(feature, cwd);
    }
    const from = continuing
      ? (before.filter(entry => entry.event === 'feature-start' && entry.feature === feature.id).pop()?.from ??
        git(cwd, 'rev-parse', 'HEAD'))
      : git(cwd, 'rev-parse', 'HEAD');
    if (!continuing) event('feature-start', { feature: feature.id, from });
    interrupted = false;
    const done = await deliver(feature, cwd, from, portBase, { again: index > 0 || continuing, continuing });
    outcomes[feature.id] = done.ok ? 'COMPLETED' : done.reason === 'budget' ? 'NOT STARTED' : 'FAILED';
    event('feature', { feature: feature.id, state: outcomes[feature.id] });
  }
  git(project, 'merge', '-q', '--ff-only', git(cwd, 'rev-parse', 'HEAD'));
} else {
  // B: the features fanned out as their prerequisites are integrated; one integrator.
  let integrating = Promise.resolve();
  const integrated = new Set();
  const failed = new Set();
  const integrate = (feature, state) => {
    const turn = integrating.then(() => integrateOnce(feature, state));
    integrating = turn.catch(() => undefined);
    return turn;
  };
  async function integrateOnce(feature, state) {
    const head = git(project, 'rev-parse', 'HEAD');
    event('feature', { feature: feature.id, state: 'INTEGRATING', onto: head });
    // From the integrated head the feature started at: its storm is part of what it brings.
    const patch = git(state.cwd, 'diff', '--binary', state.start, 'HEAD');
    const integration = `integration-${feature.id}-${state.integrations++}`;
    const path = worktree(integration, head);
    const patchFile = join(runDir, `${integration}.patch`);
    writeFileSync(patchFile, `${patch}\n`);
    const applied = patch ? tryGit(path, 'apply', '--3way', '--index', patchFile) : { ok: true };
    if (!applied.ok) {
      event('integration', { feature: feature.id, state: 'FAILED', kind: 'git', lines: tail(applied.out, 20) });
      return { ok: false, kind: 'git', lines: tail(applied.out, 20) };
    }
    commitAll(path, `${feature.id}: integrated`);
    await sh('yarn -s conventions:write', path, 300_000);
    commitAll(path, `${feature.id}: documents regenerated`);
    const gated = parse((await sh(`${tool} gate --base ${head} --mode architecture --fix --json`, path)).stdout);
    const failing = (gated?.steps ?? []).filter(step => step.status === 'fail');
    if (gated?.verdict !== 'pass') {
      const kind = failing.some(step => step.stage === 'architecture') ? 'architectural' : 'regression';
      const lines = failing.flatMap(step => [`${step.name}:`, ...(step.lines ?? []).map(line => `  ${line}`)]);
      event('integration', { feature: feature.id, state: 'FAILED', kind, lines: lines.slice(0, 80) });
      return { ok: false, kind, lines };
    }
    git(project, 'merge', '-q', '--ff-only', git(path, 'rev-parse', 'HEAD'));
    git(project, 'worktree', 'remove', '--force', path);
    event('integration', { feature: feature.id, state: 'PASSED', head: git(project, 'rev-parse', 'HEAD') });
    return { ok: true };
  }

  async function feature(f, index) {
    const port = portBase + index;
    const start = git(project, 'rev-parse', 'HEAD');
    const cwd = worktree(f.id, start);
    placeStorm(f, cwd);
    await logStrategy(f, cwd);
    const state = { cwd, start, from: git(cwd, 'rev-parse', 'HEAD'), integrations: 1 };
    const done = await deliver(f, cwd, state.from, port);
    if (!done.ok) return done.reason === 'budget' ? 'NOT STARTED' : 'FAILED';
    let result = await integrate(f, state);
    if (result.ok) return 'COMPLETED';
    // Sent back once: the integrated head merged into its worktree, conflicts and all.
    const head = git(project, 'rev-parse', 'HEAD');
    const merged = tryGit(cwd, '-c', 'user.name=flow', '-c', 'user.email=flow@example.com', 'merge', '--no-edit', head);
    const conflicts = merged.ok ? [] : git(cwd, 'diff', '--name-only', '--diff-filter=U').split('\n').filter(Boolean);
    state.from = head;
    state.start = head;
    const back = await agent(
      f,
      cwd,
      [
        `The integrator could not integrate your feature (${result.kind}). The application moved on while you worked, and I merged its current head into your worktree${conflicts.length ? `, with conflicts in: ${conflicts.join(', ')}. Resolve them keeping both sides' features` : ''}.`,
        ...(result.kind === 'git' ? [] : ['', 'What failed on the combination:', ...result.lines.slice(0, 60)]),
        '',
        `You are done when \`yarn architecture gate --base ${head} --mode architecture\` passes and the storm owes nothing. Commit.`,
      ].join('\n'),
      true,
      port,
    );
    if (!back) return 'NOT STARTED';
    const problems = await verdict(f, cwd, head);
    if (problems.length) return 'FAILED';
    result = await integrate(f, state);
    return result.ok ? 'COMPLETED' : 'FAILED';
  }

  const pending = new Map(backlog.map((f, index) => [f.id, { f, index }]));
  const active = new Map();
  while (pending.size || active.size) {
    for (const [id, { f, index }] of pending) {
      if (active.size >= parallelism) break;
      if (f.needs.some(need => failed.has(need))) {
        pending.delete(id);
        failed.add(id);
        outcomes[id] = 'NOT STARTED';
        event('feature', { feature: id, state: 'NOT STARTED', reason: 'a feature it needs failed' });
        continue;
      }
      if (overBudget) {
        pending.delete(id);
        outcomes[id] = 'NOT STARTED';
        continue;
      }
      if (!f.needs.every(need => integrated.has(need))) continue;
      pending.delete(id);
      event('feature', { feature: id, state: 'READY' });
      active.set(
        id,
        feature(f, index).then(state => {
          outcomes[id] = state;
          (state === 'COMPLETED' ? integrated : failed).add(id);
          event('feature', { feature: id, state });
          active.delete(id);
        }),
      );
    }
    if (!active.size) {
      // Nothing running and nothing startable: what is left waits on what failed.
      for (const [id] of pending) outcomes[id] = 'NOT STARTED';
      break;
    }
    await Promise.race(active.values());
  }
}

const all = backlog.every(f => outcomes[f.id] === 'COMPLETED');
event('finished', {
  state: all ? 'COMPLETED' : overBudget ? 'FAILED (budget)' : 'FAILED',
  features: outcomes,
  head: git(project, 'rev-parse', 'HEAD'),
  costUsd: spent(),
  leadTimeMs: Date.now() - started,
});
process.exit(all ? 0 : 1);
