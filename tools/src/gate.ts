import { spawnSync } from 'child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

import { checkConventions } from './check';
import { inspectInventory } from './inventory';
import { DEFAULT_LANGUAGE, loadArchitectureContract } from './load';
import { changedFiles, checkMode } from './modes';
import { carriedButOpen, loadExpectedStorm, STORMS_DIR } from './storms';
import { ModeName } from './types';

/**
 * The gate: one verdict, readable by a script, on whether a change is done (RFC 0001, phase 1).
 *
 * It runs what a person would run before calling a feature finished, in the order that makes a
 * failure cheapest to read: the feature mode against the base (did the change stay out of the
 * architecture?), the conventions check (does the tree still say what the contract says?), then
 * the language's own `checks` from its binding, as CI runs them. The steps that hold the
 * architecture come first and stop the gate when they fail: testing code the architecture
 * refuses is time spent on the wrong question. The quality and test steps after them all run, so
 * that one gate shows everything that is left to fix.
 *
 * A change that is an architecture task — a context declared, a relationship decided, by whoever
 * has no person beside them to do it (RFC 0001, phase 4: one agent taking a whole backlog) — is
 * held to the architecture mode instead (`--mode architecture`): it may touch the architecture,
 * and must record the decision.
 *
 * The gate decides nothing new: every step is a command that already exists. What it adds is the
 * verdict as data, so that whoever starts an agent — a person, a script — reads the result from
 * the commands and not from the agent's report of them.
 *
 * With `fix`, it first does the bookkeeping the tooling can do itself (ADR 31: an agent should
 * spend no turn on it): a storm the code carries whole is marked done, and documents the contract
 * renders differently are rendered again. What it fixed is in the report; it fixes nothing else.
 */

export type GateStage = 'architecture' | 'quality' | 'tests';
export type GateStatus = 'pass' | 'fail' | 'skipped';

export interface GateStep {
  name: string;
  stage: GateStage;
  /** The shell command, for a step that runs one; absent for a step the tooling runs itself. */
  command?: string;
  status: GateStatus;
  durationMs: number;
  /** What to read when it failed: the problems, or the last lines the command printed. */
  lines?: string[];
}

export interface GateReport {
  schemaVersion: 1;
  language: string;
  base: string;
  verdict: 'pass' | 'fail';
  /** With `fix`: the bookkeeping the gate did before judging, one line each. */
  fixed?: string[];
  steps: GateStep[];
  durationMs: number;
}

export interface Executed {
  code: number;
  output: string;
}

/** How a step's command runs: a shell in the language's directory. A spec replaces it. */
export type Executor = (command: string, cwd: string) => Executed;

const shell: Executor = (command, cwd) => {
  const result = spawnSync('sh', ['-c', command], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', CI: process.env.CI ?? '1' },
  });
  return { code: result.status ?? 1, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
};

/** The last lines a failed command printed: enough to act on, not a log to scroll. */
export const tail = (output: string, count = 40): string[] =>
  output
    .split('\n')
    .map(line => line.replace(/\s+$/, ''))
    .filter(Boolean)
    .slice(-count);

const timed = <T>(work: () => T): [T, number] => {
  const started = Date.now();
  const result = work();
  return [result, Date.now() - started];
};

export interface GateOptions {
  root: string;
  /** The commit the change started from; `working` for the uncommitted changes alone. */
  base: string;
  language?: string;
  /** Which mode the change is held to; a feature by default. */
  mode?: ModeName;
  /** Do the bookkeeping first: mark carried storms done, render stale documents again. */
  fix?: boolean;
  exec?: Executor;
}

/**
 * The storms under `conventions/storms` the code carries whole but that are not marked done yet,
 * marked done; answers what it marked. A storm the code does not carry whole, or one that cannot
 * be read, is left for the conventions check to report.
 */
export function markCarriedStorms(root: string, language?: string): string[] {
  const directory = join(root, STORMS_DIR);
  if (!existsSync(directory)) return [];
  const actual = inspectInventory(loadArchitectureContract(root, language), root);
  const marked: string[] = [];
  for (const name of readdirSync(directory).filter(file => file.endsWith('.yaml'))) {
    const file = `${STORMS_DIR}/${name}`;
    let storm;
    try {
      storm = loadExpectedStorm(file, root);
    } catch {
      continue;
    }
    if (!carriedButOpen(storm, actual)) continue;
    const path = join(root, file);
    writeFileSync(path, readFileSync(path, 'utf8').replace(/^done: false$/m, 'done: true'));
    marked.push(`${file}: the code carries all of it; marked done`);
  }
  return marked;
}

/**
 * The bookkeeping the tooling does itself, and what it did (ADR 31): carried storms marked done,
 * then the documents the contract renders differently written again. A check that cannot run here
 * fixes nothing, and the gate's own conventions step says why.
 */
export async function fixBookkeeping(root: string, language?: string): Promise<string[]> {
  const fixed = markCarriedStorms(root, language);
  try {
    const stale = (await checkConventions(root, false, language)).problems.filter(problem =>
      problem.includes('run the conventions check with --write'),
    );
    if (stale.length) {
      await checkConventions(root, true, language);
      fixed.push(...stale.map(problem => `rendered again: ${problem.split(':')[0]}`));
    }
  } catch {
    // the conventions step of the gate reports what kept the check from running
  }
  return fixed;
}

export async function runGate({
  root,
  base,
  language,
  mode: held = 'feature',
  fix = false,
  exec = shell,
}: GateOptions): Promise<GateReport> {
  const started = Date.now();
  const fixed = fix ? await fixBookkeeping(root, language) : [];
  const contract = loadArchitectureContract(root, language);
  const steps: GateStep[] = [];
  let blocked = false;

  const record = (step: Omit<GateStep, 'status'> & { ok: boolean }) => {
    const { ok, ...rest } = step;
    steps.push({ ...rest, status: ok ? 'pass' : 'fail', ...(ok && { lines: undefined }) });
    if (!ok && step.stage === 'architecture') blocked = true;
  };
  const skip = (name: string, stage: GateStage, command?: string) =>
    steps.push({ name, stage, ...(command && { command }), status: 'skipped', durationMs: 0 });

  // 1. The mode: what the change touched, committed since the base and not yet committed.
  const [mode, modeMs] = timed(() => {
    const changed = new Set(changedFiles(base, root));
    if (base !== 'working') for (const file of changedFiles('working', root)) changed.add(file);
    return checkMode(held, [...changed], contract, base);
  });
  record({ name: `mode ${held}`, stage: 'architecture', ok: mode.ok, durationMs: modeMs, lines: mode.problems });

  // 2. The conventions check. For the reference's own language it is the first of `checks`; for
  //    another, the language's tool holds its tree and this check holds the contract, the map and
  //    the storms, so it runs here first.
  if (contract.language.id !== DEFAULT_LANGUAGE) {
    if (blocked) skip('conventions (contract)', 'architecture');
    else {
      const startedCheck = Date.now();
      const report = await checkConventions(root, false, contract.language.id);
      record({
        name: 'conventions (contract)',
        stage: 'architecture',
        ok: report.problems.length === 0,
        durationMs: Date.now() - startedCheck,
        lines: report.problems,
      });
    }
  }

  // 3. The language's checks, in CI's order: the first holds its tree to the table.
  const cwd = join(root, contract.language.root);
  contract.checks.forEach((command, index) => {
    const stage: GateStage = index === 0 ? 'architecture' : /test/.test(command) ? 'tests' : 'quality';
    const name = index === 0 ? 'conventions' : command;
    if (blocked) {
      skip(name, stage, command);
      return;
    }
    const [result, durationMs] = timed(() => exec(command, cwd));
    record({ name, stage, command, ok: result.code === 0, durationMs, lines: tail(result.output) });
  });

  return {
    schemaVersion: 1,
    language: contract.language.id,
    base,
    verdict: steps.every(step => step.status === 'pass') ? 'pass' : 'fail',
    ...(fix && { fixed }),
    steps,
    durationMs: Date.now() - started,
  };
}

/** The gate in words, for a person at a terminal. */
export function describeGate(report: GateReport): string {
  const mark = { pass: '✓', fail: '✗', skipped: '–' } as const;
  const lines = [`gate (${report.language}, base ${report.base}): ${report.verdict.toUpperCase()}`];
  for (const line of report.fixed ?? []) lines.push(`  fixed: ${line}`);
  for (const step of report.steps) {
    const seconds = step.status === 'skipped' ? 'skipped' : `${(step.durationMs / 1000).toFixed(1)}s`;
    lines.push(
      `  ${mark[step.status]} ${step.name}${step.command && step.command !== step.name ? ` (${step.command})` : ''} — ${seconds}`,
    );
    if (step.status === 'fail') for (const line of step.lines ?? []) lines.push(`      ${line}`);
  }
  return lines.join('\n');
}
