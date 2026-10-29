#!/usr/bin/env node
/**
 * One cross-context feature, one agent per bounded context, in parallel, then one writer that
 * integrates them (RFC 0001, phase 2).
 *
 *   node .claude/flow/run-slices.mjs --project <dir> --plan <execution-plan.yaml> [--log <file.jsonl>]
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
 *   agent: { model: claude-opus-5-5, timeoutMinutes: 60 }
 *   parallelism: 2
 *   retry: { perSlice: 1 }
 *   ports: { base: 10100 }
 *
 * What it does, in order, every step appended to a JSONL log:
 *   1. holds the contract to the tooling: the storm and every plan validate, the acceptance test
 *      exists and fails at the base (a test that passes before the feature proves nothing);
 *   2. a worktree per slice beside the project, from the base, on `run/<run>/<slice>`, with its own
 *      hard-linked node_modules and its own port; the slices run at once, up to `parallelism`;
 *   3. per slice, the driver's verdict, never the agent's: the gate, and the slice's scope — a slice
 *      changes its own context's folder and nothing else (the composition root, the shared kernel's
 *      contracts, the conventions and the manifest belong to the contract stage); a failure sends
 *      the slice back once, in the same agent session, with the lines to read; an agent that says
 *      the contract is wrong (its report starts with BLOCKED) stops the feature;
 *   4. the single writer: an integration worktree from the base, each slice's patch applied, the
 *      generated documents regenerated, then the gate, what the code still owes the storm, and the
 *      acceptance test; a failure that names one slice's context sends that slice back once.
 *
 * Processes are controlled by process group, never by name. It changes nothing outside the
 * worktrees; the integrated branch `run/<run>/integration` is what a person reviews and merges.
 */
import { execFileSync, spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';

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
for (const key of ['run', 'base', 'request', 'storm', 'acceptance', 'slices']) {
  if (!plan[key]) fail(`${planFile}: ${key} is required`);
}
const run = plan.run;
const model = plan.agent?.model ?? 'claude-opus-5-5';
const timeoutMs = (plan.agent?.timeoutMinutes ?? 60) * 60_000;
const parallelism = plan.parallelism ?? 1;
const retries = plan.retry?.perSlice ?? 1;
const portBase = plan.ports?.base ?? 10100;
const request = readFileSync(resolve(dirname(planFile), plan.request), 'utf8').trim();

const flowDir = `${project}.flow`;
const runDir = join(flowDir, 'worktrees', run);
const log = resolve(option('log', join(flowDir, `${run}.jsonl`)));
mkdirSync(dirname(log), { recursive: true });
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
function exec(command, commandArgs, { cwd, timeout = timeoutMs, extraEnv = {} } = {}) {
  return new Promise(done => {
    const child = spawn(command, commandArgs, { cwd, env: { ...env, ...extraEnv }, detached: true });
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

/** A worktree beside the project, from the base, with its own copy of node_modules. */
function worktree(id) {
  const path = join(runDir, id);
  if (existsSync(path)) fail(`${path} exists: a run id is used once`);
  mkdirSync(runDir, { recursive: true });
  git(project, 'worktree', 'add', '-q', '-b', `run/${run}/${id}`, path, baseCommit);
  if (existsSync(join(project, 'node_modules'))) {
    execFileSync('cp', ['-al', join(project, 'node_modules'), join(path, 'node_modules')]);
  }
  return path;
}

async function gate(cwd) {
  const started = Date.now();
  const result = await sh(`${tool} gate --base ${baseCommit} --json`, cwd);
  const report = parse(result.stdout);
  const failing = (report?.steps ?? []).filter(step => step.status === 'fail');
  return {
    verdict: report?.verdict ?? 'unreadable',
    wallClockMs: Date.now() - started,
    steps: report?.steps?.map(step => [step.name, step.status]),
    lines: failing.flatMap(step => [`${step.name}:`, ...(step.lines ?? []).map(line => `  ${line}`)]),
  };
}

// 1. The contract, held to the tooling before anything is started.
event('started', {
  project,
  plan: planFile,
  base: plan.base,
  baseCommit,
  model,
  parallelism,
  slices: plan.slices.map(s => s.id),
});
const contractChecks = [
  [`storm validate`, `${tool} storm validate ${plan.storm}`],
  ...plan.slices.map(slice => [`plan validate ${slice.id}`, `${tool} plan validate ${slice.plan}`]),
];
const contract = [];
for (const [name, command] of contractChecks) {
  const result = await sh(command, project, 300_000);
  contract.push({
    name,
    ok: result.code === 0,
    lines: result.code === 0 ? undefined : tail(result.stdout + result.stderr, 20),
  });
}
const acceptanceExists = existsSync(join(project, plan.acceptance.file));
const red = acceptanceExists ? await sh(plan.acceptance.command, project, 600_000) : { code: 1 };
contract.push({ name: 'acceptance exists', ok: acceptanceExists });
contract.push({ name: 'acceptance red at the base', ok: acceptanceExists && red.code !== 0 });
event('contract', { checks: contract });
if (contract.some(check => !check.ok)) {
  event('finished', { state: 'BLOCKED', reason: 'the contract does not hold' });
  process.exit(1);
}

// 2. and 3. The slices, at once, each held to its gate and its scope by the driver.
const brief = (slice, port) => {
  const others = plan.slices.filter(other => other.id !== slice.id).map(other => other.context);
  return [
    `You are one of ${plan.slices.length} agents writing one feature at the same time, each in its own bounded context and its own git worktree. Yours is the ${slice.context} context; ${others.join(' and ')} ${others.length > 1 ? 'are' : 'is'} being written by the other agent${others.length > 1 ? 's' : ''}, against the same contract. You will not see their work; it is integrated after yours.`,
    'Follow `.claude/agents/feature-author.md` of this project, which says what you may change and when you are done. Read `CLAUDE.md` first. Do not ask questions: decide, and say in your final report what was unclear.',
    '',
    'The contract, decided and frozen before you started. Do not change any of it. If it is wrong or cannot be honoured, stop, and start your final report with the word BLOCKED and what you found.',
    `- The storm: \`${plan.storm}\` (\`yarn architecture storm --expect ${plan.storm}\` says what the code still owes it).`,
    `- Your plan: \`${slice.plan}\` (\`yarn architecture plan explain ${slice.plan}\` expands it into files, rules and examples).`,
    '- The integration contracts in `src/SharedKernel/Application/IntegrationEvents/`: the messages between the contexts, already written.',
    `- The acceptance test: \`${plan.acceptance.file}\`. It speaks HTTP to the whole application and passes only once every slice is integrated: do not edit it and do not expect it to pass in your worktree. Your own tests must not depend on the other slices.`,
    '',
    `Change files under \`src/Contexts/${slice.context}/\` and nowhere else: not the composition root, not package.json, not the shared kernel, not the conventions. The composition root already registers your context's module and routes. If your slice cannot be done inside that folder, stop and report BLOCKED.`,
    `Commit your work on the current branch; do not push. The commit you start from is ${baseCommit}: pass it to the gate as --base. If you start a server, use port ${port}.`,
    '',
    'The feature, in product words:',
    '',
    request,
  ].join('\n');
};

async function agent(slice, path, port, prompt, sessionId) {
  const started = Date.now();
  const runnerArgs = [
    '-p',
    prompt,
    '--output-format',
    'json',
    '--model',
    model,
    '--allowedTools',
    'Bash Read Edit Write Glob Grep',
  ];
  if (sessionId) runnerArgs.push('--resume', sessionId);
  const result = await exec('claude', runnerArgs, { cwd: path, extraEnv: { PORT: String(port) } });
  const json = parse(result.stdout);
  return {
    exitCode: result.code,
    signal: result.signal ?? undefined,
    wallClockMs: Date.now() - started,
    ...(json
      ? {
          sessionId: json.session_id,
          isError: json.is_error,
          numTurns: json.num_turns,
          durationMs: json.duration_ms,
          costUsd: json.total_cost_usd,
          modelUsage: json.modelUsage,
          report: json.result,
        }
      : { usage: 'absent: the runner printed no JSON result', stderrTail: tail(result.stderr, 20) }),
  };
}

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
  const outside = changed.filter(file => !file.startsWith(`src/Contexts/${slice.context}/`));
  return { changed, outside };
}

const slices = plan.slices.map((slice, index) => ({ ...slice, port: portBase + index, attempts: 0, cost: 0 }));

async function work(slice, feedback) {
  slice.attempts += 1;
  event('slice', { slice: slice.id, state: 'RUNNING', attempt: slice.attempts, port: slice.port });
  const prompt = feedback
    ? `The driver checked your work and it is not done:\n\n${feedback.join('\n')}\n\nFix it, inside src/Contexts/${slice.context}/, then commit. The rest of the contract is unchanged.`
    : brief(slice, slice.port);
  const result = await agent(slice, slice.path, slice.port, prompt, feedback ? slice.sessionId : undefined);
  slice.sessionId = result.sessionId ?? slice.sessionId;
  slice.cost += result.costUsd ?? 0;
  event('agent-finished', { slice: slice.id, attempt: slice.attempts, ...result });
  if (/^\s*BLOCKED/.test(result.report ?? '')) {
    event('slice', { slice: slice.id, state: 'BLOCKED', report: result.report });
    return 'BLOCKED';
  }
  event('slice', { slice: slice.id, state: 'VALIDATING' });
  const { changed, outside } = scope(slice, slice.path);
  const verdict = await gate(slice.path);
  event('gate', { slice: slice.id, verdict: verdict.verdict, changedFiles: changed.length, outside, ...verdict });
  const problems = [
    ...(outside.length
      ? [
          `Files outside src/Contexts/${slice.context}/, which this slice may not change:`,
          ...outside.map(file => `  ${file}`),
        ]
      : []),
    ...(verdict.verdict === 'pass' ? [] : verdict.lines),
  ];
  if (!problems.length) {
    event('slice', { slice: slice.id, state: 'PASSED' });
    return 'PASSED';
  }
  if (slice.attempts > retries) {
    event('slice', { slice: slice.id, state: 'FAILED', problems });
    return 'FAILED';
  }
  return work(slice, problems);
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

for (const slice of slices) {
  slice.path = worktree(slice.id);
  event('slice', { slice: slice.id, state: 'READY', worktree: slice.path, context: slice.context, plan: slice.plan });
}
const outcomes = await pool(slices, parallelism, slice => work(slice));
if (outcomes.some(outcome => outcome !== 'PASSED')) {
  event('finished', {
    state: outcomes.includes('BLOCKED') ? 'BLOCKED' : 'FAILED',
    slices: Object.fromEntries(slices.map((s, i) => [s.id, outcomes[i]])),
    costUsd: total(),
  });
  process.exit(1);
}

// 4. The single writer.
function total() {
  return Number(slices.reduce((sum, slice) => sum + slice.cost, 0).toFixed(4));
}
let integrations = 0;
async function integrate() {
  integrations += 1;
  const id = `integration-${integrations}`;
  const path = worktree(id);
  event('integration', { state: 'INTEGRATING', attempt: integrations, worktree: path });
  for (const slice of slices) {
    const patch = join(runDir, `${slice.id}-${integrations}.patch`);
    writeFileSync(patch, git(slice.path, 'diff', '--binary', baseCommit, 'HEAD') + '\n');
    try {
      execFileSync('git', ['apply', '--3way', '--index', patch], { cwd: path, encoding: 'utf8', stdio: 'pipe' });
    } catch (error) {
      event('integration', {
        state: 'BLOCKED',
        conflict: 'git',
        slice: slice.id,
        lines: tail(String(error.stderr ?? error), 20),
      });
      return { ok: false };
    }
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
    `${run}: integrate ${slices.map(s => s.id).join(', ')}`,
  );
  const verdict = await gate(path);
  const owed = await sh(`${tool} storm --expect ${plan.storm} --json`, path, 300_000);
  // What the code still owes the storm, or carries that it did not foresee: either is a
  // contract incompatibility between the slices, or a discovery to bring back to the session.
  const stillOwed = parse(owed.stdout)?.problems ?? [`unreadable: ${tail(owed.stdout + owed.stderr, 5).join(' ')}`];
  const acceptance = await sh(plan.acceptance.command, path, 600_000);
  const result = {
    head: git(path, 'rev-parse', 'HEAD'),
    regenerated: regenerated.code === 0,
    gate: verdict.verdict,
    gateSteps: verdict.steps,
    stormOwed: stillOwed,
    acceptance: acceptance.code === 0 ? 'pass' : 'fail',
  };
  const lines = [
    ...(verdict.verdict === 'pass' ? [] : verdict.lines),
    ...(stillOwed.length ? ['the storm, against the integrated code:', ...stillOwed.map(line => `  ${line}`)] : []),
    ...(acceptance.code === 0
      ? []
      : ['acceptance test:', ...tail(acceptance.stdout + acceptance.stderr, 60).map(line => `  ${line}`)]),
  ];
  event('integration', { verdict: lines.length ? 'fail' : 'pass', ...result, lines: lines.length ? lines : undefined });
  return { ok: lines.length === 0, lines, result, path };
}

let integrated = await integrate();
if (!integrated.ok && integrated.lines) {
  // A failure that names exactly one slice's context goes back to that slice, once.
  const named = slices.filter(slice => integrated.lines.some(line => line.includes(`src/Contexts/${slice.context}/`)));
  if (named.length === 1 && named[0].attempts <= retries) {
    const [slice] = named;
    const outcome = await work(slice, ['The integration of every slice failed, in your context:', ...integrated.lines]);
    if (outcome === 'PASSED') integrated = await integrate();
  }
}
event('finished', {
  state: integrated.ok ? 'COMPLETED' : 'BLOCKED',
  integration: integrated.result,
  branch: integrated.ok ? `run/${run}/integration-${integrations}` : undefined,
  attempts: Object.fromEntries(slices.map(slice => [slice.id, slice.attempts])),
  costUsd: total(),
});
process.exit(integrated.ok ? 0 : 1);
