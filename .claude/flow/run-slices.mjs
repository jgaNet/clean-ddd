#!/usr/bin/env node
/**
 * One cross-context feature, one agent per bounded context, in parallel, then the integrator that
 * every multi-agent run has (integrator.mjs, ADR 38) merges them (RFC 0001, phases 2 and 3).
 *
 *   node .claude/flow/run-slices.mjs --project <dir> --plan <execution-plan.yaml> [--runner claude-cli|claude-sdk|command]
 *   node .claude/flow/run-slices.mjs --project <dir> --plan <execution-plan.yaml> --resume
 *   node .claude/flow/run-slices.mjs --project <dir> --plan <execution-plan.yaml> --cancel
 *
 * The execution plan says how this run executes a feature whose contract was decided and frozen
 * before it (the contract stage): the storm, one feature plan per slice, the integration contracts
 * already in the shared kernel, and an acceptance test of the user-visible flow, red at the base.
 *
 *   run: notify-on-archive-1
 *   base: main
 *   request: requests/notify-on-archive.md          # product words, relative to this file
 *   storm: conventions/storms/notify-on-archive.yaml  # in the project
 *   acceptance:
 *     file: src/Bootstrap/Fastify/Acceptance/notify-on-archive.acceptance.ts
 *     command: yarn -s test --testMatch '**\/notify-on-archive.acceptance.ts'
 *   slices:
 *     - { id: notes, context: Notes, plan: conventions/plans/notify-on-archive.notes.yaml }
 *     - { id: notifications, context: Notifications, plan: conventions/plans/notify-on-archive.notifications.yaml }
 *   owner: notifications                              # the feature's owner (a slice's id); the first slice when absent
 *   agent: { runner: claude-cli, timeoutMinutes: 60 }   # and `model: <id>` to name one; the runner's default otherwise;
 *                                                       # `pack: false` tells the agents to read the guide instead of the pack;
 *                                                       # `runner: command` with `command: <sh>` rehearses without an agent
 *   parallelism: 2
 *   retry: { perSlice: 1 }                            # a slice sent back by its own verdict, after each of its turns
 *   integration: { rounds: 2 }                        # the integrator's rounds (ADR 38: two)
 *   ports: { base: 10100 }
 *   frozen: [src/Contexts/Plans/Domain/Plan/Ports/ISpacePlanQueries.ts]   # beside each plan's own `frozen`
 *   priority: cost                                    # what `clean-ddd strategy` weighs, logged with the contract (cost | time)
 *
 * What it does, in order, every step appended to a JSONL log, the run's only state:
 *   1. holds the contract to the tooling: the storm and every plan validate, the acceptance test
 *      exists and fails at the base (a test that passes before the feature proves nothing);
 *   2. a worktree per slice beside the project, from the base, on `run/<run>/<slice>`, with its own
 *      hard-linked node_modules and its own port; the slices run at once, up to `parallelism`,
 *      each under a lease — a file the driver refreshes while the slice's agent runs, naming the
 *      driver and the agent's process group;
 *   3. per slice, the driver's verdict, never the agent's: the gate, and the slice's scope — a slice
 *      changes its own context's folder and nothing else (the composition root, the shared kernel's
 *      contracts, the conventions and the manifest belong to the contract stage), and never a file
 *      the contract stage froze, even inside that folder (a read model another slice imports); a failure sends
 *      the slice back once, in the same conversation, with the lines to read; an agent that says
 *      the contract is wrong (its report starts with BLOCKED) stops the feature;
 *   4. the integrator (`integrate()` of integrator.mjs, ADR 38), whose owners are the slices, each
 *      owning its context's folder, and the feature's owner (`owner`, or the first slice) every
 *      failure that names no slice's file. Each round it
 *      - merges: a new integration worktree from the base, each slice's patch applied, the
 *        feature's owner's last; a patch that does not apply is a conflict, its slice's;
 *      - gates the merged result: the contract marked carried (the storm done, the plans' parts not
 *        new: ADR 29), the generated documents regenerated, then the gate, what the code still owes
 *        the storm, and the acceptance test;
 *      - sends each failing step to the slice whose files it names (or to the feature's owner):
 *        that slice's conversation is continued in its worktree with the lines to read, and the
 *        slice is then held to its own verdict again (step 3, with its `retry.perSlice`).
 *      After `integration.rounds` rounds (two) the merged result is judged as it stands, and the
 *      log says which failure was left and whose (`finished`, `left`). A slice that stops in an
 *      integration turn (BLOCKED, or FAILED by its own verdict) stops the feature.
 *
 * Interrupted, it resumes (`--resume`, phase 3): the log is folded into each slice's state; a slice
 * that passed stays passed; one whose agent was running when its driver died has the agent's
 * process group stopped if it outlived the driver, and is continued in the same conversation,
 * told it was interrupted; one whose agent had finished is checked again; the integration is
 * redone in a new worktree, from its first round. Resuming a finished run changes
 * nothing. `--cancel` stops a running driver: every agent is stopped, every running slice and the
 * run are recorded CANCELLED, which is final.
 *
 * The log: `started` or `resumed`, `contract`, `strategy`, `slice` (each state), `agent-finished`,
 * `gate`, `committed-leftovers`, `integration` (each merge and each merged result's verdict),
 * `integrator` (each round, as integrator.mjs logs it) and `finished`.
 *
 * Processes are controlled by process group or abort signal, never by name. It changes nothing
 * outside the worktrees; the integrated branch `run/<run>/integration-<n>` is what a person
 * reviews and merges.
 */
import { execFileSync, spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';

import { integrate } from './integrator.mjs';
import { runners } from './runners.mjs';
import { provideDependencies } from './supervision.mjs';

const args = process.argv.slice(2);
const flag = name => args.includes(`--${name}`);
const option = (name, fallback) => (flag(name) ? args[args.indexOf(`--${name}`) + 1] : fallback);
function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

const project = resolve(option('project') ?? fail('--project is required'));
const planFile = resolve(option('plan') ?? fail('--plan is required'));
const yaml = createRequire(join(project, 'package.json'))('js-yaml');
const plan = yaml.load(readFileSync(planFile, 'utf8'));
for (const key of ['run', 'base', 'request', 'storm', 'acceptance', 'slices']) {
  if (!plan[key]) fail(`${planFile}: ${key} is required`);
}
const run = plan.run;
const model = plan.agent?.model;
/**
 * `runner: command` stands in for an agent, to rehearse the driver without spending (as run-ladder's
 * does): it runs `agent.command` in the slice's worktree, with the turn's prompt in PROMPT and the
 * model in MODEL, in a process group of its own; what it prints is its report, and it costs nothing.
 */
const commandRunner = {
  name: 'command',
  run({ prompt, cwd, model: named, env: given, timeoutMs: timeout, onProcess }) {
    const begun = Date.now();
    return new Promise(done => {
      const child = spawn('sh', ['-c', plan.agent.command], {
        cwd,
        env: { ...given, PROMPT: prompt, MODEL: named ?? '' },
        detached: true,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const stop = () => {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {
          // already gone
        }
      };
      onProcess?.({ pgid: child.pid, stop });
      let report = '';
      child.stdout.on('data', chunk => (report += chunk));
      const timer = setTimeout(stop, timeout);
      child.on('close', code => {
        clearTimeout(timer);
        done({ exitCode: code, wallClockMs: Date.now() - begun, costUsd: 0, numTurns: 1, report: report.trim() });
      });
    });
  },
};
const runnerName = option('runner', plan.agent?.runner ?? 'claude-cli');
const runner = runnerName === 'command' ? commandRunner : runners[runnerName];
if (!runner) fail(`no runner named ${runnerName}; one of ${[...Object.keys(runners), 'command'].join(', ')}`);
if (runner === commandRunner && !plan.agent?.command) fail(`${planFile}: runner command needs agent.command`);
const timeoutMs = (plan.agent?.timeoutMinutes ?? 60) * 60_000;
const parallelism = plan.parallelism ?? 1;
const retries = plan.retry?.perSlice ?? 1;
const rounds = plan.integration?.rounds ?? 2;
const featureOwner = plan.owner ?? plan.slices[0]?.id;
if (!plan.slices.some(slice => slice.id === featureOwner)) fail(`${planFile}: owner ${featureOwner} is not a slice`);
const portBase = plan.ports?.base ?? 10100;
const request = readFileSync(resolve(dirname(planFile), plan.request), 'utf8').trim();

const flowDir = `${project}.flow`;
const runDir = join(flowDir, 'worktrees', run);
const log = resolve(option('log', join(flowDir, `${run}.jsonl`)));
const lockFile = join(flowDir, `${run}.lock`);
mkdirSync(dirname(log), { recursive: true });

const alive = pid => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

// --cancel: the running driver is told to stop; it records the cancellation itself.
if (flag('cancel')) {
  const lock = existsSync(lockFile) ? JSON.parse(readFileSync(lockFile, 'utf8')) : undefined;
  if (!lock || !alive(lock.pid)) fail(`${run} is not running`);
  process.kill(lock.pid, 'SIGTERM');
  process.stdout.write(`${run}: asked driver ${lock.pid} to cancel\n`);
  process.exit(0);
}

const history = existsSync(log)
  ? readFileSync(log, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line))
  : [];
const resuming = flag('resume');
if (resuming && !history.length) fail(`${log}: nothing to resume`);
if (!resuming && history.length) fail(`${log} exists: a run id is used once; --resume to continue it`);
const finishedBefore = history.find(each => each.event === 'finished');
if (finishedBefore) {
  process.stdout.write(`${run}: already finished (${finishedBefore.state}); nothing to resume\n`);
  process.exit(finishedBefore.state === 'COMPLETED' ? 0 : 1);
}
if (existsSync(lockFile) && alive(JSON.parse(readFileSync(lockFile, 'utf8')).pid)) fail(`${run} is already running`);
writeFileSync(lockFile, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));

const event = (name, data = {}) => {
  const line = { run, event: name, at: new Date().toISOString(), ...data };
  appendFileSync(log, `${JSON.stringify(line)}\n`);
  process.stdout.write(
    `${line.at.slice(11, 19)} ${name}${data.slice ? ` ${data.slice}` : ''}${data.state ? ` → ${data.state}` : ''}${data.verdict ? ` (${data.verdict})` : ''}\n`,
  );
  return line;
};
const git = (cwd, ...gitArgs) =>
  execFileSync('git', gitArgs, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).trim();
const env = { ...process.env, YARN_IGNORE_ENGINES: 'true', FORCE_COLOR: '0', NO_COLOR: '1' };

/** A command in its own process group, so a timeout stops it and everything it started. */
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
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      done({ code, signal, stdout, stderr });
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

const baseCommit = git(project, 'rev-parse', plan.base);
const tool = 'yarn -s architecture';

/** A worktree beside the project, from the base, with its own copy of node_modules; resumed, the one already there. */
function worktree(id) {
  const path = join(runDir, id);
  if (existsSync(path)) {
    if (resuming) return path;
    fail(`${path} exists: a run id is used once`);
  }
  mkdirSync(runDir, { recursive: true });
  git(project, 'worktree', 'add', '-q', '-b', `run/${run}/${id}`, path, baseCommit);
  provideDependencies(project, path, plan.dependencies ?? 'copy');
  return path;
}

/** A step's lines, as an agent reads them: its name, then its lines indented. */
const flatten = steps => steps.flatMap(step => [`${step.name}:`, ...step.lines.map(line => `  ${line}`)]);

/** The gate's verdict; `failing` its failing steps, `{ name, lines }` — a verdict with none to show is one. */
async function gate(cwd) {
  const started = Date.now();
  const result = await sh(`${tool} gate --base ${baseCommit} --json`, cwd);
  const report = parse(result.stdout);
  const verdict = report?.verdict ?? 'unreadable';
  let failing = (report?.steps ?? [])
    .filter(step => step.status === 'fail')
    .map(step => ({ name: step.name, lines: (step.lines ?? []).map(String) }));
  // A gate that failed without a step to show, or printed nothing readable, is not a pass.
  if (verdict !== 'pass' && !failing.length)
    failing = [{ name: 'gate', lines: [`verdict: ${verdict}`, ...tail(result.stdout + result.stderr, 20)] }];
  return {
    verdict,
    wallClockMs: Date.now() - started,
    steps: report?.steps?.map(step => [step.name, step.status]),
    failing,
    lines: flatten(failing),
  };
}

// Cancel: every agent stopped, every running slice and the run recorded CANCELLED.
let slices = [];
const running = new Map(); // slice id → { stop }
let cancelled = false;
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    if (cancelled) return;
    cancelled = true;
    for (const [id, handle] of running) {
      handle.stop?.();
      event('slice', { slice: id, state: 'CANCELLED' });
      rmSync(join(runDir, `${id}.lease`), { force: true });
    }
    event('finished', { state: 'CANCELLED', signal, costUsd: total() });
    rmSync(lockFile, { force: true });
    process.exit(130);
  });
}

// 1. The contract, held to the tooling before anything is started — once per run.
const contractBefore = history.find(each => each.event === 'contract');
let packs = contractBefore?.packs ?? false;
if (resuming) {
  event('resumed', { runner: runner.name, driver: process.pid });
} else {
  event('started', {
    project,
    plan: planFile,
    base: plan.base,
    baseCommit,
    runner: runner.name,
    model,
    parallelism,
    slices: plan.slices.map(s => s.id),
  });
}
if (!contractBefore) {
  const contractChecks = [
    [`storm validate`, `${tool} storm validate ${plan.storm}`],
    ...plan.slices.map(slice => [`plan validate ${slice.id}`, `${tool} plan validate ${slice.plan}`]),
  ];
  const checks = [];
  for (const [name, command] of contractChecks) {
    const result = await sh(command, project, 300_000);
    checks.push({
      name,
      ok: result.code === 0,
      lines: result.code === 0 ? undefined : tail(result.stdout + result.stderr, 20),
    });
  }
  const acceptanceExists = existsSync(join(project, plan.acceptance.file));
  const red = acceptanceExists ? await sh(plan.acceptance.command, project, 600_000) : { code: 1 };
  checks.push({ name: 'acceptance exists', ok: acceptanceExists });
  checks.push({ name: 'acceptance red at the base', ok: acceptanceExists && red.code !== 0 });
  // The slice's own view of the feature, when the project's tooling has it (RFC gap G7).
  packs =
    plan.agent?.pack !== false &&
    (await sh(`${tool} pack --plan ${plan.slices[0].plan} --json`, project, 120_000)).code === 0;
  event('contract', { checks, packs });
  // What `clean-ddd strategy` recommends for this feature, logged beside the fan-out this run is
  // (RFC 0001, phase 6); tooling older than the command logs nothing.
  const advice = parse(
    (await sh(`${tool} strategy --storm ${plan.storm} --priority ${plan.priority ?? 'cost'} --json`, project, 120_000))
      .stdout,
  );
  if (advice?.strategy) {
    const { strategy: recommended, estimate, inputs } = advice;
    event('strategy', { ran: 'fan-out-by-context', recommended, estimate, inputs });
  }
  if (checks.some(check => !check.ok)) {
    event('finished', { state: 'BLOCKED', reason: 'the contract does not hold' });
    rmSync(lockFile, { force: true });
    process.exit(1);
  }
}

// 2. and 3. The slices, at once, each held to its gate and its scope by the driver.
// What the contract stage froze for the slices, wherever it lives — a read model in one slice's own
// context that another slice's adapter imports is frozen for that slice too (phase 4 found one moved
// and extended in place, invisible from its worktree): the execution plan's list and each plan's.
const frozen = [
  ...new Set([
    ...(plan.frozen ?? []),
    ...plan.slices.flatMap(slice => {
      try {
        return yaml.load(readFileSync(join(project, slice.plan), 'utf8'))?.frozen ?? [];
      } catch {
        return [];
      }
    }),
  ]),
];
const brief = (slice, port) => {
  const others = plan.slices.filter(other => other.id !== slice.id).map(other => other.context);
  return [
    others.length
      ? `You are one of ${plan.slices.length} agents writing one feature at the same time, each in its own bounded context and its own git worktree. Yours is the ${slice.context} context; ${others.join(' and ')} ${others.length > 1 ? 'are' : 'is'} being written by the other agent${others.length > 1 ? 's' : ''}, against the same contract. You will not see their work; it is integrated after yours.`
      : `You are writing one feature, in the ${slice.context} context, in your own git worktree, against a contract decided before you started. It is integrated after you finish.`,
    'Follow `.claude/agents/feature-author.md` of this project, which says what you may change and when you are done. Read `CLAUDE.md` first. Do not ask questions: decide, and say in your final report what was unclear.',
    '',
    ...(packs
      ? [
          `Start with \`yarn architecture pack --plan ${slice.plan}\`: it is your part of the feature — what is yours to write and where, the files that show each shape, what the other slices write, the contracts between you, the rules you are bound by.`,
          '',
        ]
      : []),
    'The contract, decided and frozen before you started. Do not change any of it. If it is wrong or cannot be honoured, stop, and start your final report with the word BLOCKED and what you found.',
    ...(others.length
      ? []
      : [
          `You are the only slice, so the feature is whole in your worktree: once the code carries the storm, mark the contract carried — \`done: true\` in the storm, \`new: false\` on the plan's parts that now exist (ADR 29). Those two flags are the only change you may make outside your context's folder.`,
        ]),
    `- The storm: \`${plan.storm}\` (\`yarn architecture storm --expect ${plan.storm}\` says what the code still owes it).`,
    `- Your plan: \`${slice.plan}\`.`,
    ...(frozen.length
      ? [
          `- Files frozen for every slice, even inside your own context: ${frozen.map(file => `\`${file}\``).join(', ')}. Do not move, rename or edit them. If you need more than one gives — another method, another field — add a port or a file of your own beside it; if that cannot work, say so in your report: the contract is amended by the person who froze it.`,
        ]
      : []),
    '- The integration contracts in `src/SharedKernel/Application/IntegrationEvents/`: the messages between the contexts, already written.',
    others.length
      ? `- The acceptance test: \`${plan.acceptance.file}\`. It speaks HTTP to the whole application and passes only once every slice is integrated: do not edit it and do not expect it to pass in your worktree. Your own tests must not depend on the other slices.`
      : `- The acceptance test: \`${plan.acceptance.file}\`. It speaks HTTP to the whole application: do not edit it; it should pass once you are done (\`${plan.acceptance.command}\`).`,
    '',
    `Change files under \`src/Contexts/${slice.context}/\` and nowhere else: not the composition root, not package.json, not the shared kernel, not the conventions. The composition root already registers your context's module and routes. If your slice cannot be done inside that folder, stop and report BLOCKED.`,
    `Commit your work on the current branch; do not push. The commit you start from is ${baseCommit}: pass it to the gate as --base. If you start a server, use port ${port}.`,
    '',
    'The feature, in product words:',
    '',
    request,
  ].join('\n');
};

/** What a slice changed, committed or not; anything outside its context is out of its scope. */
function scope(slice, path) {
  if (git(path, 'status', '--porcelain')) {
    git(path, 'add', '-A');
    git(
      path,
      '-c',
      'user.name=flow',
      '-c',
      'user.email=flow@example.com',
      'commit',
      '-qm',
      `${slice.id}: work the agent left uncommitted`,
    );
    event('committed-leftovers', { slice: slice.id });
  }
  const changed = git(path, 'diff', '--name-only', baseCommit).split('\n').filter(Boolean);
  // A feature of one slice is whole in its worktree: its contract's flags are its to set (ADR 29).
  const flags = plan.slices.length === 1 ? [plan.storm, slice.plan] : [];
  const outside = changed.filter(file => !file.startsWith(`src/Contexts/${slice.context}/`) && !flags.includes(file));
  // A frozen file is out of scope wherever it lives; one that no longer exists was moved or deleted.
  const touchedFrozen = frozen.filter(file => changed.includes(file) || !existsSync(join(path, file)));
  return { changed, outside, touchedFrozen };
}

/** The lease a running slice holds: the driver, the agent's process group, refreshed while it runs. */
function lease(slice, holder) {
  const file = join(runDir, `${slice.id}.lease`);
  const write = () =>
    writeFileSync(file, JSON.stringify({ driver: process.pid, ...holder, at: new Date().toISOString() }));
  write();
  const timer = setInterval(write, 30_000);
  return () => {
    clearInterval(timer);
    rmSync(file, { force: true });
  };
}

/** A lease a dead driver left: its agent, if it outlived the driver, is stopped by process group. */
function reclaim(slice) {
  const file = join(runDir, `${slice.id}.lease`);
  if (!existsSync(file)) return undefined;
  const held = JSON.parse(readFileSync(file, 'utf8'));
  let stopped = false;
  if (held.pgid && alive(held.pgid)) {
    try {
      process.kill(-held.pgid, 'SIGKILL');
      stopped = true;
    } catch {
      // gone in between
    }
  }
  rmSync(file, { force: true });
  return { driver: held.driver, pgid: held.pgid, at: held.at, orphanStopped: stopped };
}

async function agent(slice, prompt, again) {
  const result = await runner.run({
    prompt,
    cwd: slice.path,
    project,
    model,
    again,
    env: { ...env, PORT: String(slice.port) },
    timeoutMs,
    onProcess: handle => {
      running.set(slice.id, handle);
      slice.release?.();
      slice.release = lease(slice, { pgid: handle.pgid });
    },
  });
  running.delete(slice.id);
  slice.release?.();
  slice.release = undefined;
  return result;
}

async function validate(slice) {
  event('slice', { slice: slice.id, state: 'VALIDATING' });
  const { changed, outside, touchedFrozen } = scope(slice, slice.path);
  const verdict = await gate(slice.path);
  event('gate', {
    slice: slice.id,
    verdict: verdict.verdict,
    changedFiles: changed.length,
    outside,
    touchedFrozen,
    ...verdict,
    failing: undefined, // its lines are logged already
  });
  return [
    ...(touchedFrozen.length
      ? [
          'Frozen files this slice changed, moved or deleted — the other slices import them as they were:',
          ...touchedFrozen.map(file => `  ${file}`),
          'Put each back exactly as it was frozen. If you need more than it gives, add a port or a file of your own beside it.',
        ]
      : []),
    ...(outside.length
      ? [
          `Files outside src/Contexts/${slice.context}/, which this slice may not change:`,
          ...outside.map(file => `  ${file}`),
        ]
      : []),
    ...(verdict.verdict === 'pass' ? [] : verdict.lines),
  ];
}

/**
 * One turn of a slice: the agent, then the driver's verdict. `feedback` sends the agent back with
 * the lines to read (a retry); `interrupted` continues a conversation its driver lost (a resume,
 * which is not a retry); `integration` continues it with what the integrator sent (a round, not a
 * retry: the slice's own verdict then has its `retry.perSlice` again).
 */
async function work(slice, { feedback, interrupted, integration } = {}) {
  if (feedback) slice.retries += 1;
  if (integration) slice.retries = 0;
  slice.attempts += 1;
  event('slice', {
    slice: slice.id,
    state: 'RUNNING',
    attempt: slice.attempts,
    port: slice.port,
    ...(feedback && { retry: true }),
    ...(interrupted && { interrupted: true }),
    ...(integration && { integration: true }),
  });
  const prompt = interrupted
    ? `Your work on this slice was interrupted: the driver that ran you stopped before you finished. Your worktree is as you left it. Finish the slice — inside src/Contexts/${slice.context}/ — make the gate pass with --base ${baseCommit}, commit, and give your final report. The contract is unchanged.`
    : integration
      ? integration.join('\n')
      : feedback
        ? `The driver checked your work and it is not done:\n\n${feedback.join('\n')}\n\nFix it, inside src/Contexts/${slice.context}/, then commit. The rest of the contract is unchanged.`
        : brief(slice, slice.port);
  const result = await agent(slice, prompt, Boolean(feedback || interrupted || integration));
  // A continued conversation reports its running total: the slice's cost is the latest figure.
  if (result.costUsd !== undefined) slice.cost = Math.max(slice.cost, result.costUsd);
  event('agent-finished', { slice: slice.id, attempt: slice.attempts, runner: runner.name, ...result });
  if (cancelled) return 'CANCELLED';
  if (/^\s*BLOCKED/.test(result.report ?? '')) {
    event('slice', { slice: slice.id, state: 'BLOCKED', report: result.report });
    return 'BLOCKED';
  }
  return settle(slice, await validate(slice));
}

async function settle(slice, problems) {
  if (!problems.length) {
    event('slice', { slice: slice.id, state: 'PASSED' });
    return 'PASSED';
  }
  if (slice.retries >= retries) {
    event('slice', { slice: slice.id, state: 'FAILED', problems });
    return 'FAILED';
  }
  return work(slice, { feedback: problems });
}

/** A slice its driver lost: reclaimed, checked as it stands, continued if it is not done. */
async function resumeSlice(slice) {
  const reclaimed = reclaim(slice);
  event('slice', { slice: slice.id, state: 'RESUMING', from: slice.state, ...(reclaimed && { lease: reclaimed }) });
  if (slice.state === 'READY') return work(slice);
  // Its agent had finished, and the driver was checking it: the check is redone.
  if (slice.state === 'VALIDATING') return settle(slice, await validate(slice));
  // Its agent was writing: only the agent knows what is left, so it continues. A gate that
  // passes on half a slice says the code is sound, not that the slice is done (phase 3).
  return work(slice, { interrupted: true });
}

async function pool(items, size, fn) {
  const results = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await fn(items[index]);
      }
    }),
  );
  return results;
}

function total() {
  return Number(slices.reduce((sum, slice) => sum + slice.cost, 0).toFixed(4));
}

/** Each slice as the log left it: its state, its turns, its retries, its cost. */
function fold(slice) {
  const mine = history.filter(each => each.slice === slice.id);
  const states = mine.filter(each => each.event === 'slice');
  const ready = states.find(each => each.state === 'READY');
  // A resume that was itself interrupted resumes from where the slice was before it.
  const last = states.filter(each => each.state !== 'RESUMING').at(-1);
  const turns = states.filter(each => each.state === 'RUNNING');
  // The retries count from the slice's last integration turn, which gave it its `retry.perSlice` again.
  const sinceIntegration = turns.slice(turns.findLastIndex(each => each.integration) + 1);
  return {
    state: last?.state ?? 'PENDING',
    path: ready?.worktree,
    attempts: turns.length,
    retries: sinceIntegration.filter(each => each.retry).length,
    cost: Math.max(0, ...mine.filter(each => each.event === 'agent-finished').map(each => each.costUsd ?? 0)),
  };
}

slices = plan.slices.map((slice, index) => ({
  ...slice,
  port: portBase + index,
  attempts: 0,
  retries: 0,
  cost: 0,
  state: 'PENDING',
  ...(resuming ? fold(slice) : {}),
}));
for (const slice of slices) {
  if (slice.state === 'PENDING') {
    slice.path = worktree(slice.id);
    slice.state = 'READY';
    event('slice', { slice: slice.id, state: 'READY', worktree: slice.path, context: slice.context, plan: slice.plan });
  }
}
const outcomes = await pool(slices, parallelism, slice => {
  if (slice.state === 'PASSED') return 'PASSED';
  if (['BLOCKED', 'FAILED', 'CANCELLED'].includes(slice.state)) return slice.state;
  return resuming ? resumeSlice(slice) : work(slice);
});
if (outcomes.some(outcome => outcome !== 'PASSED')) {
  event('finished', {
    state: outcomes.includes('BLOCKED') ? 'BLOCKED' : outcomes.includes('CANCELLED') ? 'CANCELLED' : 'FAILED',
    slices: Object.fromEntries(slices.map((s, i) => [s.id, outcomes[i]])),
    costUsd: total(),
  });
  rmSync(lockFile, { force: true });
  process.exit(1);
}

for (const [index, slice] of slices.entries()) slice.outcome = outcomes[index];

// 4. The integrator (integrator.mjs, ADR 38): the slices are its owners, each owning its context's
// folder, as the scope check does; a failure that names no slice's file is the feature's owner's.
const owners = slices.map(slice => ({
  name: slice.id,
  owns: [`^src/Contexts/${slice.context.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/`],
}));
const sliceOf = id => slices.find(slice => slice.id === id);
const order = [...slices.filter(slice => slice.id !== featureOwner), sliceOf(featureOwner)];
let integrations = history.filter(each => each.event === 'integration' && each.state === 'INTEGRATING').length;
let latest; // the latest integration: its id, its worktree, the verdict on it
const conflicts = {}; // slice id → what git said when its patch did not apply
/** A slice stopped in an integration turn (BLOCKED, or FAILED by its own verdict): the feature stops. */
class SliceStopped extends Error {}

/** A new integration worktree from the base, each slice's patch applied, the feature's owner's last. */
async function merge() {
  if (slices.some(slice => slice.outcome !== 'PASSED')) throw new SliceStopped();
  integrations += 1;
  const id = `integration-${integrations}`;
  const path = join(runDir, id);
  if (existsSync(path)) {
    // a resumed run: the integration its driver did not finish is redone from the base
    git(project, 'worktree', 'remove', '--force', path);
    git(project, 'branch', '-D', `run/${run}/${id}`);
  }
  mkdirSync(runDir, { recursive: true });
  git(project, 'worktree', 'add', '-q', '-b', `run/${run}/${id}`, path, baseCommit);
  provideDependencies(project, path, plan.dependencies ?? 'copy');
  latest = { id, path };
  event('integration', { state: 'INTEGRATING', attempt: integrations, worktree: path });
  for (const slice of order) {
    const patch = join(runDir, `${slice.id}-${integrations}.patch`);
    const diff = git(slice.path, 'diff', '--binary', baseCommit, 'HEAD');
    if (!diff) {
      event('integration', { slice: slice.id, empty: true });
      continue;
    }
    writeFileSync(patch, diff + '\n');
    try {
      execFileSync('git', ['apply', '--3way', '--index', patch], { cwd: path, encoding: 'utf8', stdio: 'pipe' });
    } catch (error) {
      const unmerged = git(path, 'diff', '--name-only', '--diff-filter=U').split('\n').filter(Boolean);
      const files = unmerged.length
        ? unmerged
        : git(slice.path, 'diff', '--name-only', baseCommit, 'HEAD').split('\n').filter(Boolean);
      conflicts[slice.id] = tail(String(error.stderr ?? error), 20);
      event('integration', {
        state: 'CONFLICT',
        conflict: 'git',
        slice: slice.id,
        files,
        lines: conflicts[slice.id],
      });
      return { conflict: { owner: slice.id, files } };
    }
  }
  return {};
}

/**
 * The merged result, held to what the single writer held it to: the contract marked carried, the
 * documents regenerated, then the gate, what the code still owes the storm, and the acceptance test.
 */
async function judge() {
  const { path } = latest;
  // Every slice is in: the integrator says the contract is carried — the storm done, the plans'
  // parts no longer new — and the check below then holds the code to all of it (ADR 29). A slice
  // could not say so alone: it carries its own part, and the rest is in the other worktrees.
  const carried = [plan.storm, ...slices.map(slice => slice.plan)];
  for (const file of carried) {
    const text = readFileSync(join(path, file), 'utf8');
    writeFileSync(
      join(path, file),
      file === plan.storm
        ? text.replace(/^done: false$/m, 'done: true')
        : text.replace(/^(\s+)new: true$/gm, '$1new: false'),
    );
  }
  const regenerated = await sh('yarn -s conventions:write', path, 300_000);
  git(path, 'add', '-A');
  git(
    path,
    '-c',
    'user.name=flow',
    '-c',
    'user.email=flow@example.com',
    'commit',
    '-qm',
    `${run}: integrate ${order.map(s => s.id).join(', ')}`,
  );
  const verdict = await gate(path);
  const owed = await sh(`${tool} storm --expect ${plan.storm} --json`, path, 300_000);
  // What the code still owes the storm, or carries that it did not foresee: either is a
  // contract incompatibility between the slices, or a discovery to bring back to the session.
  const stillOwed = (
    parse(owed.stdout)?.problems ?? [`unreadable: ${tail(owed.stdout + owed.stderr, 5).join(' ')}`]
  ).map(String);
  const acceptance = await sh(plan.acceptance.command, path, 600_000);
  const steps = [
    ...(verdict.verdict === 'pass' ? [] : verdict.failing),
    ...(stillOwed.length ? [{ name: 'the storm, against the integrated code', lines: stillOwed }] : []),
    ...(acceptance.code === 0
      ? []
      : [{ name: 'acceptance test', lines: tail(acceptance.stdout + acceptance.stderr, 60) }]),
  ];
  latest.result = {
    head: git(path, 'rev-parse', 'HEAD'),
    regenerated: regenerated.code === 0,
    gate: verdict.verdict,
    gateSteps: verdict.steps,
    stormOwed: stillOwed,
    acceptance: acceptance.code === 0 ? 'pass' : 'fail',
  };
  event('integration', {
    verdict: steps.length ? 'fail' : 'pass',
    ...latest.result,
    lines: steps.length ? flatten(steps) : undefined,
  });
  return { pass: steps.length === 0, steps };
}

/** A slice's conversation, continued in its worktree with what the integrator found, then its own verdict. */
async function send(owner, kind, lines) {
  const slice = sliceOf(owner);
  const others = slices.filter(other => other !== slice).map(other => `\`run/${run}/${other.id}\``);
  const message =
    kind === 'conflict'
      ? [
          `The integrator applied every slice's work on the base, and yours did not apply over the others' (${others.join(', ')}). It conflicts in:`,
          '',
          ...lines.map(file => `  ${file}`),
          '',
          ...(conflicts[slice.id]?.length ? ['git said:', ...conflicts[slice.id].map(line => `  ${line}`), ''] : []),
          `A slice changes src/Contexts/${slice.context}/ and nothing else: undo any change outside it, read the other slices' branches if you need to see what they changed (do not merge them), keep the gate passing with --base ${baseCommit}, and commit.`,
        ]
      : [
          `The integrator applied every slice's work on the base and checked the result: the gate, what the code still owes the storm, and the acceptance test. These failures name files in your context${slice.id === featureOwner ? ", or no slice's file, and the feature is yours" : ''}:`,
          '',
          ...lines,
          '',
          `Fix what is yours, inside src/Contexts/${slice.context}/, then commit. You may read the other slices' branches to reproduce it (${others.length ? others.join(', ') : 'there are none'}); do not merge them. If what fails is not yours to fix and you cannot fix it inside your folder, say so in your final report. The rest of the contract is unchanged.`,
        ];
  slice.outcome = await work(slice, { integration: message });
}

let integrated;
try {
  integrated = await integrate({
    owners,
    featureOwner,
    merge,
    gate: judge,
    send,
    rounds,
    log: (name, data) => event(name, data),
  });
} catch (error) {
  if (!(error instanceof SliceStopped)) throw error;
  const stopped = slices.map(slice => slice.outcome);
  event('finished', {
    state: stopped.includes('BLOCKED') ? 'BLOCKED' : stopped.includes('CANCELLED') ? 'CANCELLED' : 'FAILED',
    slices: Object.fromEntries(slices.map(slice => [slice.id, slice.outcome])),
    integration: latest?.result,
    attempts: Object.fromEntries(slices.map(slice => [slice.id, slice.attempts])),
    costUsd: total(),
  });
  rmSync(lockFile, { force: true });
  process.exit(1);
}
event('finished', {
  state: integrated.pass ? 'COMPLETED' : 'BLOCKED',
  integration: latest?.result,
  branch: integrated.pass ? `run/${run}/${latest.id}` : undefined,
  rounds: integrated.rounds.length,
  // After the last round, what was left and whose it was (ADR 38).
  ...(integrated.left && { left: integrated.left }),
  ...(integrated.conflict && { conflict: integrated.conflict }),
  attempts: Object.fromEntries(slices.map(slice => [slice.id, slice.attempts])),
  costUsd: total(),
});
rmSync(lockFile, { force: true });
process.exit(integrated.pass ? 0 : 1);
