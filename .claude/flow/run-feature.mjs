#!/usr/bin/env node
/**
 * One feature, one isolated agent, one verdict (RFC 0001, phase 1).
 *
 *   node .claude/flow/run-feature.mjs --project <dir> --base <ref> --request <file> --run <id>
 *        [--model <id>] [--timeout-minutes 60] [--log <file.jsonl>]
 *
 * In the project (an application `clean-ddd create` made, or any repository with `conventions/`):
 *   1. a git worktree on a branch `run/<id>`, from the base, beside the project rather than inside it
 *      (the project's own test runner and linter would otherwise walk it), with its own copy of the
 *      project's node_modules (hard links: cheap, and an agent's `yarn add` changes its copy only);
 *   2. Claude Code, headless, in that worktree, given the request and the project's own agent brief
 *      (`.claude/agents/feature-author.md`); its usage is what its JSON result reports, nothing more;
 *   3. the gate, run here on the worktree — never read from the agent's report;
 *   4. every step appended to a JSONL log, one event per line, so a run can be read, resumed or
 *      compared without this script.
 *
 * It decides nothing about the architecture and changes nothing outside the worktree. It is the
 * smallest driver that answers phase 1's question: does the gate's verdict match what a person
 * reads from the same checks?
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : fallback);
const required = name => option(name) ?? fail(`--${name} is required`);
function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

const project = resolve(required('project'));
const base = required('base');
const request = readFileSync(resolve(required('request')), 'utf8').trim();
const run = required('run');
const model = option('model');
const timeoutMs = Number(option('timeout-minutes', '60')) * 60_000;
// Beside the project: `<project>.flow/`. Inside it, the project's own tools would walk every worktree.
const flowDir = `${project}.flow`;
const log = resolve(option('log', join(flowDir, `${run}.jsonl`)));
const worktree = join(flowDir, 'worktrees', run);

mkdirSync(dirname(log), { recursive: true });
const event = (name, data = {}) => {
  const line = { run, event: name, at: new Date().toISOString(), ...data };
  appendFileSync(log, `${JSON.stringify(line)}\n`);
  return line;
};
const git = (cwd, ...gitArgs) => execFileSync('git', gitArgs, { cwd, encoding: 'utf8' }).trim();

// 1. The workspace.
const baseCommit = git(project, 'rev-parse', base);
if (existsSync(worktree)) fail(`${worktree} exists: a run id is used once`);
git(project, 'worktree', 'add', '-q', '-b', `run/${run}`, worktree, baseCommit);
// A copy, not a link: an agent that adds a dependency must not change what the other runs, or the project, see.
if (existsSync(join(project, 'node_modules'))) {
  execFileSync('cp', ['-al', join(project, 'node_modules'), join(worktree, 'node_modules')]);
}
event('started', { project, base, baseCommit, worktree, model });

// 2. The agent. Its brief is the project's own; the request is in product words.
const brief = [
  'You are working in a git worktree of a project, on its branch. Implement the request below as one feature,',
  'following the instructions in `.claude/agents/feature-author.md` of this project, which say what you may',
  'change and when you are done. Read `CLAUDE.md` first. Do not ask questions: decide, and say in your final',
  'report what was unclear. Commit your work on the current branch; do not push.',
  `The commit you start from is ${baseCommit}: pass it to the gate as --base.`,
  '',
  'The request:',
  '',
  request,
].join('\n');

const agentStarted = Date.now();
const agent = spawnSync(
  'claude',
  [
    '-p',
    brief,
    '--output-format',
    'json',
    ...(model ? ['--model', model] : []),
    '--allowedTools',
    'Bash Read Edit Write Glob Grep',
  ],
  {
    cwd: worktree,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, YARN_IGNORE_ENGINES: 'true' },
  },
);
let result;
try {
  result = JSON.parse(agent.stdout);
} catch {
  result = undefined;
}
// Only what the runner reports; an absent field stays absent.
event('agent-finished', {
  exitCode: agent.status,
  signal: agent.signal ?? undefined,
  wallClockMs: Date.now() - agentStarted,
  ...(result && {
    isError: result.is_error,
    terminalReason: result.terminal_reason,
    durationMs: result.duration_ms,
    numTurns: result.num_turns,
    costUsd: result.total_cost_usd,
    modelUsage: result.modelUsage,
    report: result.result,
  }),
  ...(!result && { usage: 'absent: the runner printed no JSON result', stderrTail: (agent.stderr ?? '').slice(-2000) }),
});

// 3. The gate, run by the driver on the worktree.
const usesYarn = (() => {
  try {
    return Boolean(JSON.parse(readFileSync(join(worktree, 'package.json'), 'utf8')).scripts?.architecture);
  } catch {
    return false;
  }
})();
const gateCommand = usesYarn
  ? ['yarn', ['-s', 'architecture', 'gate', '--base', baseCommit, '--json']]
  : ['npx', ['clean-ddd', 'gate', '--base', baseCommit, '--json']];
const gateStarted = Date.now();
const gate = spawnSync(gateCommand[0], gateCommand[1], {
  cwd: worktree,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
  env: { ...process.env, YARN_IGNORE_ENGINES: 'true' },
});
let report;
try {
  report = JSON.parse(gate.stdout);
} catch {
  report = undefined;
}
event('gate', {
  wallClockMs: Date.now() - gateStarted,
  ...(report
    ? { verdict: report.verdict, report }
    : { verdict: 'unreadable', stdoutTail: (gate.stdout ?? '').slice(-2000) }),
});

const head = git(worktree, 'rev-parse', 'HEAD');
const commits = Number(git(worktree, 'rev-list', '--count', `${baseCommit}..HEAD`));
const changed = git(worktree, 'diff', '--name-only', baseCommit).split('\n').filter(Boolean);
const finished = event('finished', {
  head,
  commits,
  changedFiles: changed.length,
  verdict: report?.verdict ?? 'unreadable',
});

process.stdout.write(
  `${run}: gate ${finished.verdict}, ${commits} commit(s), ${changed.length} file(s) changed` +
    `${result?.total_cost_usd !== undefined ? `, $${result.total_cost_usd.toFixed(2)}` : ', cost absent'}; log ${log}\n`,
);
process.exit(finished.verdict === 'pass' ? 0 : 1);
